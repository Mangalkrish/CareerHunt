import mongoose from "mongoose";

const skillSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Skill name is required"],
    trim: true,
    lowercase: true,
  },
  confidence: {
    type: Number,
    required: true,
    min: 0,
    max: 1,
    default: 0.8,
  },
  source: {
    type: String,
    enum: ["resume", "job_posting", "manual"],
    required: true,
  },
  applications: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Application",
  }],
  jobs: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Job",
  }],
  frequency: {
    type: Number,
    default: 1,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Compound index for efficient queries
skillSchema.index({ name: 1, source: 1 });

// Virtual for skill node ID (for knowledge graph)
skillSchema.virtual('kgNodeId').get(function() {
  return `skill_${this.name}`;
});

export const Skill = mongoose.model("Skill", skillSchema); 