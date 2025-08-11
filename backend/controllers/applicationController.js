import { catchAsyncErrors } from "../middlewares/catchAsyncError.js";
import ErrorHandler from "../middlewares/error.js";
import { Application } from "../models/applicationSchema.js";
import { Job } from "../models/jobSchema.js";
import cloudinary from "cloudinary";
import { extractSkillsFromResume, saveExtractedSkills } from "../utils/resumeParser.js";
import { addSkillToKnowledgeGraph, addJobToKnowledgeGraph } from "../utils/kgIntegration.js";

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
  const allowedFormats = ["image/png", "image/jpeg", "image/webp"];
  if (!allowedFormats.includes(resume.mimetype)) {
    return next(
      new ErrorHandler("Please upload file in png format ", 400)
    );
  }
  
  try {
    // Upload resume to Cloudinary
    const cloudinaryResponse = await cloudinary.uploader.upload(
      resume.tempFilePath
    );

    if (!cloudinaryResponse || cloudinaryResponse.error) {
      console.error(
        "Cloudinary Error:",
        cloudinaryResponse.error || "Unknown Cloudinary error"
      );
      return next(new ErrorHandler("Failed to upload Resume to Cloudinary", 500));
    }

    const { name, email, coverLetter, phone, address, jobId } = req.body;
    const applicantID = {
      user: req.user._id,
      role: "Job Seeker",
    };
    
    if (!jobId) {
      return next(new ErrorHandler(" This Job is not Available!", 404));
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
      !address ||
      !applicantID ||
      !employerID ||
      !resume
    ) {
      return next(new ErrorHandler("Please fill all details.", 400));
    }

    // Create the application
    const application = await Application.create({
      name,
      email,
      coverLetter,
      phone,
      address,
      applicantID,
      employerID,
      resume: {
        public_id: cloudinaryResponse.public_id,
        url: cloudinaryResponse.secure_url,
      },
    });

    // Extract skills from resume text (cover letter and resume content)
    let extractedSkills = [];
    try {
      // For now, we'll use the cover letter text for skill extraction
      // In a production system, you'd want to extract text from the actual resume file
      const resumeText = coverLetter; // This could be enhanced to parse actual resume files
      
      if (resumeText) {
        extractedSkills = await extractSkillsFromResume(resumeText, application._id);
        
        if (extractedSkills.length > 0) {
          // Save extracted skills to database
          const savedSkills = await saveExtractedSkills(extractedSkills, application._id);
          
          // Update knowledge graph with new skills
          for (const skill of savedSkills) {
            try {
              // Add skill to knowledge graph
              await addSkillToKnowledgeGraph(
                skill.name,
                [], // related skills (could be enhanced)
                [jobId] // related jobs
              );
            } catch (kgError) {
              console.error(`Failed to add skill ${skill.name} to knowledge graph:`, kgError);
              // Continue with other skills even if one fails
            }
          }
          
          console.log(`Extracted and saved ${savedSkills.length} skills from resume`);
        }
      }
    } catch (skillError) {
      console.error("Error during skill extraction:", skillError);
      // Don't fail the application submission if skill extraction fails
    }

    res.status(200).json({
      success: true,
      message: "Application Submitted!",
      application,
      extractedSkills: extractedSkills.map(s => ({ name: s.name, confidence: s.confidence }))
    });
    
  } catch (error) {
    console.error("Error in postApplication:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
});

export const employerGetAllApplications = catchAsyncErrors(
  async (req, res, next) => {
    const { role } = req.user;
    if (role === "Job Seeker") {
      return next(
        new ErrorHandler("Job Seeker Cannot access this resource.", 400)
      );
    }
    const { _id } = req.user;
    const applications = await Application.find({ "employerID.user": _id });
    res.status(200).json({
      success: true,
      applications,
    });
  }
);

export const jobseekerGetAllApplications = catchAsyncErrors(
  async (req, res, next) => {
    const { role } = req.user;
    if (role === "Employer") {
      return next(
        new ErrorHandler("Employer cannot access this resource.", 400)
      );
    }
    const { _id } = req.user;
    const applications = await Application.find({ "applicantID.user": _id });
    res.status(200).json({
      success: true,
      applications,
    });
  }
);

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
    await application.deleteOne();
    res.status(200).json({
      success: true,
      message: "Application Deleted!",
    });
  }
);
