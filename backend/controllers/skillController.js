import { catchAsyncErrors } from "../middlewares/catchAsyncError.js";
import ErrorHandler from "../middlewares/error.js";
import { Skill } from "../models/skillSchema.js";
import { findSimilarJobs, findRelatedSkills, getKnowledgeGraphStats } from "../utils/kgIntegration.js";

/**
 * Get all skills with their frequencies
 */
export const getAllSkills = catchAsyncErrors(async (req, res, next) => {
  try {
    const skills = await Skill.find({}).sort({ frequency: -1 });
    
    res.status(200).json({
      success: true,
      skills,
      count: skills.length
    });
  } catch (error) {
    return next(new ErrorHandler("Failed to fetch skills", 500));
  }
});

/**
 * Get skills for a specific application
 */
export const getSkillsForApplication = catchAsyncErrors(async (req, res, next) => {
  try {
    const { applicationId } = req.params;
    
    const skills = await Skill.find({ applications: applicationId });
    
    res.status(200).json({
      success: true,
      skills,
      count: skills.length
    });
  } catch (error) {
    return next(new ErrorHandler("Failed to fetch application skills", 500));
  }
});

/**
 * Find similar jobs based on skills
 */
export const findJobsBySkills = catchAsyncErrors(async (req, res, next) => {
  try {
    const { skills, limit = 5 } = req.body;
    
    if (!skills || !Array.isArray(skills) || skills.length === 0) {
      return next(new ErrorHandler("Please provide an array of skills", 400));
    }
    
    // Query the knowledge graph for similar jobs
    const similarJobs = await findSimilarJobs(skills, limit);
    
    res.status(200).json({
      success: true,
      skills,
      similarJobs,
      count: similarJobs.length
    });
  } catch (error) {
    console.error("Error finding jobs by skills:", error);
    return next(new ErrorHandler("Failed to find similar jobs", 500));
  }
});

/**
 * Find related skills based on input skills
 */
export const findRelatedSkills = catchAsyncErrors(async (req, res, next) => {
  try {
    const { skills, limit = 5 } = req.body;
    
    if (!skills || !Array.isArray(skills) || skills.length === 0) {
      return next(new ErrorHandler("Please provide an array of skills", 400));
    }
    
    // Query the knowledge graph for related skills
    const relatedSkills = await findRelatedSkills(skills, limit);
    
    res.status(200).json({
      success: true,
      inputSkills: skills,
      relatedSkills,
      count: relatedSkills.length
    });
  } catch (error) {
    console.error("Error finding related skills:", error);
    return next(new ErrorHandler("Failed to find related skills", 500));
  }
});

/**
 * Get skill recommendations for a target job
 */
export const getSkillRecommendations = catchAsyncErrors(async (req, res, next) => {
  try {
    const { targetJob, currentSkills = [], limit = 10 } = req.body;
    
    if (!targetJob) {
      return next(new ErrorHandler("Please provide a target job", 400));
    }
    
    // This would typically query the knowledge graph to find skills needed for the target job
    // For now, we'll return a basic recommendation based on common job requirements
    
    const commonJobSkills = {
      "Software Engineer": ["programming", "problem solving", "teamwork", "communication"],
      "Data Scientist": ["statistics", "machine learning", "python", "sql", "data analysis"],
      "Product Manager": ["leadership", "communication", "project management", "user research"],
      "UI/UX Designer": ["design", "prototyping", "user research", "creativity", "communication"],
      "DevOps Engineer": ["docker", "kubernetes", "aws", "ci/cd", "linux", "scripting"]
    };
    
    const targetSkills = commonJobSkills[targetJob] || [];
    const missingSkills = targetSkills.filter(skill => 
      !currentSkills.some(currentSkill => 
        currentSkill.toLowerCase().includes(skill.toLowerCase())
      )
    );
    
    res.status(200).json({
      success: true,
      targetJob,
      currentSkills,
      recommendedSkills: missingSkills.slice(0, limit),
      count: missingSkills.length
    });
  } catch (error) {
    console.error("Error getting skill recommendations:", error);
    return next(new ErrorHandler("Failed to get skill recommendations", 500));
  }
});

/**
 * Get knowledge graph statistics
 */
export const getKnowledgeGraphStats = catchAsyncErrors(async (req, res, next) => {
  try {
    const stats = await getKnowledgeGraphStats();
    
    res.status(200).json({
      success: true,
      stats
    });
  } catch (error) {
    console.error("Error getting KG stats:", error);
    return next(new ErrorHandler("Failed to get knowledge graph statistics", 500));
  }
});

/**
 * Search skills by name
 */
export const searchSkills = catchAsyncErrors(async (req, res, next) => {
  try {
    const { query, limit = 20 } = req.query;
    
    if (!query || query.trim().length < 2) {
      return next(new ErrorHandler("Search query must be at least 2 characters", 400));
    }
    
    const skills = await Skill.find({
      name: { $regex: query, $options: 'i' }
    })
    .sort({ frequency: -1 })
    .limit(parseInt(limit));
    
    res.status(200).json({
      success: true,
      query,
      skills,
      count: skills.length
    });
  } catch (error) {
    return next(new ErrorHandler("Failed to search skills", 500));
  }
});

/**
 * Get top skills by frequency
 */
export const getTopSkills = catchAsyncErrors(async (req, res, next) => {
  try {
    const { limit = 20 } = req.query;
    
    const skills = await Skill.find({})
      .sort({ frequency: -1 })
      .limit(parseInt(limit));
    
    res.status(200).json({
      success: true,
      skills,
      count: skills.length
    });
  } catch (error) {
    return next(new ErrorHandler("Failed to fetch top skills", 500));
  }
}); 