import { catchAsyncErrors } from "../middlewares/catchAsyncError.js";
import { Skill } from "../models/skillSchema.js";
import ErrorHandler from "../middlewares/error.js";
import { findRelatedSkills as findRelated, getKnowledgeGraphStats as getKGStats, findSimilarJobs } from "../utils/kgIntegration.js";

// Uses MongoDB
export const getAllSkills = catchAsyncErrors(async (req, res, next) => {
  const skills = await Skill.find({});
  res.status(200).json({
    success: true,
    skills,
  });
});

// Uses MongoDB
export const getSkillsForApplication = catchAsyncErrors(async (req, res, next) => {
  const { applicationId } = req.params;
  const skills = await Skill.find({ applications: applicationId });
  if (skills.length === 0) {
    return next(new ErrorHandler("No skills found for this application.", 404));
  }
  res.status(200).json({
    success: true,
    skills,
  });
});

// Uses Knowledge Graph (Python)
export const findJobsBySkills = catchAsyncErrors(async (req, res, next) => {
  const { skills: skillNames, limit } = req.body; // Array of skill names
  if (!skillNames || skillNames.length === 0) {
    return next(new ErrorHandler("Please provide a list of skills.", 400));
  }
  
  const jobIds = await findSimilarJobs(skillNames, limit || 10);
  
  res.status(200).json({
    success: true,
    message: "Jobs fetched based on skill similarity.",
    jobIds, // Returns only IDs; frontend must fetch job details
  });
});

// Uses Knowledge Graph (Python)
export const findRelatedSkills = catchAsyncErrors(async (req, res, next) => {
  const { skills: skillNames, limit } = req.body; // Array of skill names
  if (!skillNames || skillNames.length === 0) {
    return next(new ErrorHandler("Please provide a list of skills.", 400));
  }
  
  const relatedSkills = await findRelated(skillNames, limit || 5);
  
  res.status(200).json({
    success: true,
    relatedSkills,
  });
});

// Simplified/Removed in favor of Job Recommendations (in jobController)
// This endpoint is now redundant since the core recs are on job/recommendations
export const getSkillRecommendations = catchAsyncErrors(async (req, res, next) => {
    return next(new ErrorHandler("This endpoint is deprecated. Use /api/v1/job/recommendations for personalized job suggestions.", 410));
});

// Uses Knowledge Graph (Python)
export const getKnowledgeGraphStats = catchAsyncErrors(async (req, res, next) => {
    const stats = await getKGStats();
    if (stats.error) {
        return next(new ErrorHandler("Failed to retrieve KG stats: " + stats.error, 500));
    }
    res.status(200).json({
        success: true,
        stats,
    });
});

// Simple MongoDB/Search logic
export const searchSkills = catchAsyncErrors(async (req, res, next) => {
    const { query } = req.query;
    if (!query) {
        return next(new ErrorHandler("Query parameter is required.", 400));
    }
    const skills = await Skill.find({ name: { $regex: query, $options: 'i' } }).limit(10);
    res.status(200).json({
        success: true,
        skills,
    });
});

// Simple MongoDB/Sort logic
export const getTopSkills = catchAsyncErrors(async (req, res, next) => {
    const skills = await Skill.find({}).sort({ frequency: -1 }).limit(10);
    res.status(200).json({
        success: true,
        skills,
    });
});