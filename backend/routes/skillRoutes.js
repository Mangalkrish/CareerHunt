import express from "express";
import {
  getAllSkills,
  getSkillsForApplication,
  findJobsBySkills,
  findRelatedSkills,
  getSkillRecommendations,
  getKnowledgeGraphStats,
  searchSkills,
  getTopSkills
} from "../controllers/skillController.js";
import { isAuthenticated } from "../middlewares/auth.js";

const router = express.Router();

// Public routes (no authentication required)
router.get("/all", getAllSkills);
router.get("/search", searchSkills);
router.get("/top", getTopSkills);
router.get("/stats", getKnowledgeGraphStats);

// Protected routes (authentication required)
router.get("/application/:applicationId", isAuthenticated, getSkillsForApplication);
router.post("/find-jobs", isAuthenticated, findJobsBySkills);
router.post("/find-related", isAuthenticated, findRelatedSkills);
router.post("/recommendations", isAuthenticated, getSkillRecommendations);

export default router; 