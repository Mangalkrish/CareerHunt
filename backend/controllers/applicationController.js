import { catchAsyncErrors } from "../middlewares/catchAsyncError.js";
import ErrorHandler from "../middlewares/error.js";
import { Application } from "../models/applicationSchema.js";
import { Job } from "../models/jobSchema.js";
import { User } from "../models/userSchema.js"; // Import User for updating last processed app
import cloudinary from "cloudinary";
import { performRAGEvaluation, processAndEmbedCV } from "../utils/aiService.js"; // IMPORT AI SERVICE

// --- POST APPLICATION (ENHANCED FOR CV PROCESSING) ---
export const postApplication = catchAsyncErrors(async (req, res, next) => {
  const { role } = req.user;
  if (role === "Employer") {
    return next(
      new ErrorHandler("Employer cannot access these resources.", 400)
    );
  }
  if (!req.files || Object.keys(req.files).length === 0) {
    return next(new ErrorHandler("Please Upload Resume", 400));
  }

  const { resume } = req.files;
  // IMPORTANT: Allow PDF/DOCX formats for CVs
  const allowedFormats = ["image/png", "image/jpeg", "image/webp", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
  if (!allowedFormats.includes(resume.mimetype)) {
    return next(
      new ErrorHandler("Please upload file in PNG, JPEG, WEBP, PDF, or DOCX format.", 400)
    );
  }
  
  // 1. Upload resume to Cloudinary (ensure it's public and set resource_type)
  // Determine resource_type based on file type - CRITICAL: PDFs must be "raw", not "image"
  let resourceType = "auto";
  const isPDF = resume.mimetype === "application/pdf" || resume.name.toLowerCase().endsWith('.pdf');
  const isImage = resume.mimetype.startsWith("image/");
  
  if (isPDF) {
    resourceType = "raw"; // PDFs MUST be uploaded as raw files, not images
  } else if (isImage) {
    resourceType = "image"; // Images should be uploaded as images
  }
  
  console.log(`[Cloudinary Upload] Uploading file:`);
  console.log(`  - Name: ${resume.name}`);
  console.log(`  - MIME Type: ${resume.mimetype}`);
  console.log(`  - Detected as PDF: ${isPDF}`);
  console.log(`  - Resource Type: ${resourceType}`);
  
  const uploadOptions = {
    resource_type: resourceType,
    access_mode: "public", // Ensure public access
    folder: "resumes", // Optional: organize in folder
    use_filename: false, // Don't use original filename
    unique_filename: true, // Ensure unique filenames
    overwrite: false, // Don't overwrite existing files
    invalidate: true // Invalidate CDN cache
  };
  
  // For raw files, we might need to add type parameter
  if (resourceType === "raw") {
    uploadOptions.type = "upload";
  }
  
  const cloudinaryResponse = await cloudinary.uploader.upload(
    resume.tempFilePath,
    uploadOptions
  );

  if (!cloudinaryResponse || cloudinaryResponse.error) {
    console.error(
      "Cloudinary Error:",
      cloudinaryResponse.error || "Unknown Cloudinary error"
    );
    return next(new ErrorHandler("Failed to upload Resume to Cloudinary", 500));
  }

  // Verify the upload was successful and log access mode
  console.log(`[Cloudinary Upload] File uploaded successfully:`);
  console.log(`  - Public ID: ${cloudinaryResponse.public_id}`);
  console.log(`  - URL: ${cloudinaryResponse.secure_url}`);
  console.log(`  - Access Mode: ${cloudinaryResponse.access_mode || 'Not specified'}`);
  console.log(`  - Resource Type: ${cloudinaryResponse.resource_type}`);
  
  // Note: Even if access_mode is not 'public', signed URLs will work for download
  // The Python service uses Cloudinary SDK with signed URLs, which works for both public and private resources
  if (cloudinaryResponse.access_mode !== 'public') {
    console.warn(`[Cloudinary Upload] Access mode is '${cloudinaryResponse.access_mode}', but signed URLs will be used for download`);
    console.log(`[Cloudinary Upload] This is fine - the Python service will use authenticated signed URLs`);
  } else {
    console.log(`[Cloudinary Upload] Resource is public - direct download should work, but signed URLs will be used as fallback`);
  }
  
  // Log the final URL that will be used
  console.log(`[Cloudinary Upload] Final URL for download: ${cloudinaryResponse.secure_url}`);
  
  const { name, email, coverLetter, phone, address, jobId } = req.body;
  const applicantID = {
    user: req.user._id,
    role: "Job Seeker",
  };
  
  if (!jobId) {
    return next(new ErrorHandler("Job ID is missing or not available!", 404));
  }
  
  const jobDetails = await Job.findById(jobId);
  if (!jobDetails) {
    return next(new ErrorHandler("This Job is not Available!", 404));
  }

  const employerID = {
    user: jobDetails.postedBy,
    role: "Employer",
  };
  
  if (
    !name ||
    !email ||
    !coverLetter ||
    !phone ||
    !address
    // applicantID and employerID are derived from auth and job, resume checked above
  ) {
    return next(new ErrorHandler("Please fill all required details.", 400));
  }
  
  // 2. Create Application in MongoDB
  const application = await Application.create({
    name,
    email,
    coverLetter,
    phone,
    address,
    jobId: jobId, 
    applicantID,
    employerID,
    resume: {
      public_id: cloudinaryResponse.public_id,
      url: cloudinaryResponse.secure_url,
    },
    relevanceScore: null, // Initialize AI fields
    feedback: null,
  });

  // 3. Trigger CV processing (fire-and-forget for quick response)
  // This handles skill extraction, KG update, and initial Chroma DB embedding.
  processAndEmbedCV(application.resume.url, application._id.toString())
    .catch(err => {
      console.error(`[CV PROCESSING FAILED] Application ${application._id}: ${err.message}`);
    });


  res.status(200).json({
    success: true,
    message: "Application Submitted! Your CV is now being processed by the AI pipeline.",
    application,
  });
});

// --- EMPLOYER: GET ALL APPLICATIONS (Populated) ---
export const employerGetAllApplications = catchAsyncErrors(
  async (req, res, next) => {
    const { role } = req.user;
    if (role === "Job Seeker") {
      return next(
        new ErrorHandler("Job Seeker Cannot access this resource.", 400)
      );
    }
    const { _id } = req.user;
    // Populate job details for frontend display
    const applications = await Application.find({ "employerID.user": _id }).populate({
        path: 'jobId', 
        select: 'title category description'
    });
    res.status(200).json({
      success: true,
      applications,
    });
  }
);

// --- JOBSEEKER: GET ALL APPLICATIONS (Populated) ---
export const jobseekerGetAllApplications = catchAsyncErrors(
  async (req, res, next) => {
    const { role } = req.user;
    if (role === "Employer") {
      return next(
        new ErrorHandler("Employer cannot access this resource.", 400)
      );
    }
    const { _id } = req.user;
    // Populate job details for frontend display
    const applications = await Application.find({ "applicantID.user": _id }).populate({
        path: 'jobId', 
        select: 'title category description'
    });
    res.status(200).json({
      success: true,
      applications,
    });
  }
);

// --- NEW: EMPLOYER REQUESTS AI EVALUATION ---
export const evaluateApplication = catchAsyncErrors(async (req, res, next) => {
    const { role } = req.user;
    if (role === "Job Seeker") {
        return next(
            new ErrorHandler("Job Seeker cannot access this resource.", 400)
        );
    }
    const { id } = req.params; // Application ID

    const application = await Application.findById(id);

    if (!application) {
        return next(new ErrorHandler("Application not found!", 404));
    }
    
    // Security check: Ensure the employer owns the job associated with the application
    if (application.employerID.user.toString() !== req.user._id.toString()) {
        return next(new ErrorHandler("You are not authorized to evaluate this application.", 403));
    }

    // Call AI Service for RAG evaluation (Llama 3, Chroma, KG)
    const aiResult = await performRAGEvaluation(application.jobId.toString(), application._id.toString());
    
    // Update MongoDB application record with AI results
    const updatedApplication = await Application.findByIdAndUpdate(
        id,
        {
            relevanceScore: aiResult.relevanceScore,
            feedback: aiResult.feedback,
        },
        { new: true, runValidators: true }
    ).populate({
        path: 'jobId', 
        select: 'title category description'
    });

    res.status(200).json({
        success: true,
        message: "AI Evaluation complete. Score and feedback updated.",
        application: updatedApplication,
    });
});

// --- DELETE APPLICATION (ENHANCED FOR KG CLEANUP) ---
export const jobseekerDeleteApplication = catchAsyncErrors(
  async (req, res, next) => {
    const { role } = req.user;
    if (role === "Employer") {
      return next(
        new ErrorHandler("Employer Cannot access this resource.", 400)
      );
    }
    const { id } = req.params;
    const application = await Application.findById(id);
    if (!application) {
      return next(new ErrorHandler("Application not found!", 404));
    }
    
    // TODO: Signal Python KG to delete the corresponding CV node in ChromaDB/KG
    // (This functionality is not fully implemented in kgIntegration.js, but is required)

    await application.deleteOne();
    res.status(200).json({
      success: true,
      message: "Application Deleted!",
    });
  }
);
