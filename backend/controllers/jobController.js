import { catchAsyncErrors } from "../middlewares/catchAsyncError.js";
import { Job } from "../models/jobSchema.js";
import ErrorHandler from "../middlewares/error.js";
import { processAndEmbedJD, deleteJobFromKG, getAIJobRecommendations } from "../utils/aiService.js"; // IMPORT AI SERVICE

export const getAllJobs = catchAsyncErrors(async (req, res, next) => {
  const jobs = await Job.find({ expired: false });
  res.status(200).json({
    success: true,
    jobs,
  });
});

// --- POST JOB (ENHANCED FOR JD PROCESSING) ---
export const postJob = catchAsyncErrors(async (req, res, next) => {
  const { role } = req.user;
  if (role === "Job Seeker") {
    return next(
      new ErrorHandler("Job Seeker not allowed to access this resource.", 400)
    );
  }
  const {
    title,
    description,
    category,
    country,
    city,
    location,
    fixedSalary,
    salaryFrom,
    salaryTo,
  } = req.body;

  if (!title || !description || !category || !country || !city || !location) {
    return next(new ErrorHandler("Please provide full job details.", 400));
  }

  if ((!salaryFrom || !salaryTo) && !fixedSalary) {
    return next(
      new ErrorHandler(
        "Please either provide fixed salary or ranged salary.",
        400
      )
    );
  }

  if (salaryFrom && salaryTo && fixedSalary) {
    return next(
      new ErrorHandler("Cannot Enter Fixed and Ranged Salary together.", 400)
    );
  }
  const postedBy = req.user._id;
  
  // 1. Create Job in MongoDB
  const job = await Job.create({
    title,
    description,
    category,
    country,
    city,
    location,
    fixedSalary,
    salaryFrom,
    salaryTo,
    postedBy,
  });

  // 2. Trigger JD processing (fire-and-forget)
  // This embeds the JD, extracts skills, and updates the Knowledge Graph.
  processAndEmbedJD(job._id.toString(), title, description)
    .catch(err => {
        console.error(`[JD PROCESSING FAILED] Job ${job._id}: ${err.message}`);
    });
    
  res.status(200).json({
    success: true,
    message: "Job Posted Successfully! JD processing started for RAG.",
    job,
  });
});

// --- JOBSEEKER: GET AI JOB RECOMMENDATIONS ---
export const getRecommendedJobs = catchAsyncErrors(async (req, res, next) => {
    const { role } = req.user;
    if (role === "Employer") {
        return next(
            new ErrorHandler("Employer not allowed to access this resource.", 400)
        );
    }
    const userId = req.user._id;

    // 1. Call AI Service for ranked Job IDs (uses KG/Vector similarity)
    const jobIds = await getAIJobRecommendations(userId);
    
    if (!jobIds || jobIds.length === 0) {
        return res.status(200).json({
            success: true,
            message: "No AI recommendations found based on your latest CV.",
            jobs: [],
        });
    }

    // 2. Fetch the full Job documents from MongoDB using the ranked IDs
    const jobs = await Job.find({
        _id: { $in: jobIds },
        expired: false
    });
    
    // Manually sort the results to respect the order from the AI service
    const sortedJobs = jobIds.map(id => jobs.find(job => job._id.toString() === id)).filter(job => job);

    res.status(200).json({
        success: true,
        message: "AI Job Recommendations fetched successfully.",
        jobs: sortedJobs,
    });
});

export const getMyJobs = catchAsyncErrors(async (req, res, next) => {
  const { role } = req.user;
  if (role === "Job Seeker") {
    return next(
      new ErrorHandler("Job Seeker not allowed to access this resource.", 400)
    );
  }
  const myJobs = await Job.find({ postedBy: req.user._id });
  res.status(200).json({
    success: true,
    myJobs,
  });
});

// --- UPDATE JOB (ENHANCED FOR KG UPDATE) ---
export const updateJob = catchAsyncErrors(async (req, res, next) => {
  const { role } = req.user;
  if (role === "Job Seeker") {
    return next(
      new ErrorHandler("Job Seeker not allowed to access this resource.", 400)
    );
  }
  const { id } = req.params;
  let job = await Job.findById(id);
  if (!job) {
    return next(new ErrorHandler("OOPS! Job not found.", 404));
  }
  job = await Job.findByIdAndUpdate(id, req.body, {
    new: true,
    runValidators: true,
    useFindAndModify: false,
  });
  
  // Trigger JD processing for the updated description (fire-and-forget)
  if (req.body.description || req.body.title) {
      processAndEmbedJD(job._id.toString(), job.title, job.description)
        .catch(err => {
            console.error(`[JD UPDATE FAILED] Job ${job._id}: ${err.message}`);
        });
  }
  
  res.status(200).json({
    success: true,
    message: "Job Updated! RAG/KG data update triggered.",
  });
});

// --- DELETE JOB (ENHANCED FOR KG CLEANUP) ---
export const deleteJob = catchAsyncErrors(async (req, res, next) => {
  const { role } = req.user;
  if (role === "Job Seeker") {
    return next(
      new ErrorHandler("Job Seeker not allowed to access this resource.", 400)
    );
  }
  const { id } = req.params;
  const job = await Job.findById(id);
  if (!job) {
    return next(new ErrorHandler("OOPS! Job not found.", 404));
  }
  
  // Trigger KG cleanup (fire-and-forget)
  deleteJobFromKG(id)
      .catch(err => {
          console.error(`[KG CLEANUP FAILED] Job ${id}: ${err.message}`);
      });
      
  await job.deleteOne();
  res.status(200).json({
    success: true,
    message: "Job Deleted! KG cleanup triggered.",
  });
});

export const getSingleJob = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  try {
    const job = await Job.findById(id);
    if (!job) {
      return next(new ErrorHandler("Job not found.", 404));
    }
    res.status(200).json({
      success: true,
      job,
    });
  } catch (error) {
    return next(new ErrorHandler(`Invalid ID / CastError`, 404));
  }
});
