import { Skill } from "../models/skillSchema.js";

// Common technical skills database
const TECHNICAL_SKILLS = {
  // Programming Languages
  "python": ["python", "py", "django", "flask", "pandas", "numpy", "scikit-learn"],
  "javascript": ["javascript", "js", "node.js", "react", "vue", "angular", "express"],
  "java": ["java", "spring", "hibernate", "maven", "gradle"],
  "c++": ["c++", "cpp", "stl", "boost"],
  "c#": ["c#", "csharp", ".net", "asp.net", "entity framework"],
  "php": ["php", "laravel", "symfony", "wordpress"],
  "ruby": ["ruby", "rails", "sinatra"],
  "go": ["go", "golang"],
  "rust": ["rust"],
  "swift": ["swift", "ios", "xcode"],
  "kotlin": ["kotlin", "android"],
  
  // Web Technologies
  "html": ["html", "html5"],
  "css": ["css", "css3", "sass", "scss", "less", "bootstrap", "tailwind"],
  "sql": ["sql", "mysql", "postgresql", "sqlite", "oracle", "mongodb"],
  "nosql": ["nosql", "mongodb", "redis", "cassandra", "dynamodb"],
  
  // Frameworks & Libraries
  "react": ["react", "react.js", "reactjs", "jsx", "redux", "next.js"],
  "angular": ["angular", "angularjs", "typescript"],
  "vue": ["vue", "vue.js", "vuejs", "nuxt.js"],
  "node.js": ["node", "node.js", "express", "koa", "hapi"],
  "django": ["django", "djangorestframework"],
  "flask": ["flask", "werkzeug"],
  "spring": ["spring", "spring boot", "spring mvc"],
  
  // Cloud & DevOps
  "aws": ["aws", "amazon web services", "ec2", "s3", "lambda", "cloudformation"],
  "azure": ["azure", "microsoft azure", "azure devops"],
  "gcp": ["gcp", "google cloud", "google cloud platform"],
  "docker": ["docker", "containerization", "kubernetes", "k8s"],
  "kubernetes": ["kubernetes", "k8s", "helm", "minikube"],
  "jenkins": ["jenkins", "ci/cd", "continuous integration"],
  "git": ["git", "github", "gitlab", "bitbucket", "version control"],
  
  // Data Science & ML
  "machine learning": ["machine learning", "ml", "ai", "artificial intelligence", "deep learning"],
  "data analysis": ["data analysis", "data analytics", "business intelligence", "bi"],
  "statistics": ["statistics", "statistical analysis", "hypothesis testing"],
  "r": ["r", "rstudio", "ggplot2", "dplyr"],
  "tensorflow": ["tensorflow", "keras", "pytorch", "scikit-learn"],
  
  // Tools & Platforms
  "figma": ["figma", "ui/ux", "design", "prototyping"],
  "adobe": ["adobe", "photoshop", "illustrator", "xd", "creative suite"],
  "jira": ["jira", "atlassian", "agile", "scrum", "kanban"],
  "confluence": ["confluence", "documentation", "knowledge management"],
  "slack": ["slack", "communication", "team collaboration"],
  
  // Soft Skills
  "leadership": ["leadership", "team lead", "management", "supervision"],
  "communication": ["communication", "presentation", "public speaking", "writing"],
  "problem solving": ["problem solving", "analytical thinking", "critical thinking"],
  "teamwork": ["teamwork", "collaboration", "team player"],
  "agile": ["agile", "scrum", "kanban", "sprint planning"],
  "project management": ["project management", "pmp", "prince2"],
};

// Soft skills that are commonly mentioned
const SOFT_SKILLS = [
  "leadership", "communication", "problem solving", "teamwork", "agile",
  "project management", "time management", "organization", "creativity",
  "adaptability", "flexibility", "attention to detail", "multitasking",
  "customer service", "sales", "marketing", "research", "analysis"
];

/**
 * Extract skills from resume text using keyword matching and NLP techniques
 * @param {string} resumeText - The text content of the resume
 * @param {string} applicationId - The application ID for tracking
 * @returns {Array} Array of extracted skills with confidence scores
 */
export const extractSkillsFromResume = async (resumeText, applicationId) => {
  try {
    const extractedSkills = [];
    const text = resumeText.toLowerCase();
    
    // Extract technical skills
    for (const [skillName, keywords] of Object.entries(TECHNICAL_SKILLS)) {
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          // Calculate confidence based on context and frequency
          const confidence = calculateSkillConfidence(text, keyword, skillName);
          if (confidence > 0.3) { // Minimum confidence threshold
            extractedSkills.push({
              name: skillName,
              confidence: confidence,
              source: "resume",
              applicationId: applicationId
            });
            break; // Found this skill, move to next
          }
        }
      }
    }
    
    // Extract soft skills
    for (const skill of SOFT_SKILLS) {
      if (text.includes(skill)) {
        const confidence = calculateSkillConfidence(text, skill, skill);
        if (confidence > 0.3) {
          extractedSkills.push({
            name: skill,
            confidence: confidence,
            source: "resume",
            applicationId: applicationId
          });
        }
      }
    }
    
    // Remove duplicates and sort by confidence
    const uniqueSkills = removeDuplicateSkills(extractedSkills);
    uniqueSkills.sort((a, b) => b.confidence - a.confidence);
    
    return uniqueSkills;
    
  } catch (error) {
    console.error("Error extracting skills from resume:", error);
    return [];
  }
};

/**
 * Calculate confidence score for a skill based on context
 * @param {string} text - Resume text
 * @param {string} keyword - Found keyword
 * @param {string} skillName - Skill name
 * @returns {number} Confidence score between 0 and 1
 */
const calculateSkillConfidence = (text, keyword, skillName) => {
  let confidence = 0.5; // Base confidence
  
  // Higher confidence if skill appears multiple times
  const occurrences = (text.match(new RegExp(keyword, 'g')) || []).length;
  if (occurrences > 1) confidence += 0.2;
  
  // Higher confidence if skill appears in skills section
  const skillsSection = text.includes('skills') || text.includes('technical skills') || 
                       text.includes('competencies') || text.includes('expertise');
  if (skillsSection) confidence += 0.2;
  
  // Higher confidence if skill appears near years of experience
  const yearPattern = /\d+\s*(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exp)/gi;
  const hasExperience = yearPattern.test(text);
  if (hasExperience) confidence += 0.1;
  
  // Higher confidence for technical skills vs soft skills
  if (TECHNICAL_SKILLS[skillName]) confidence += 0.1;
  
  return Math.min(confidence, 1.0);
};

/**
 * Remove duplicate skills and merge confidence scores
 * @param {Array} skills - Array of skills
 * @returns {Array} Array of unique skills
 */
const removeDuplicateSkills = (skills) => {
  const skillMap = new Map();
  
  for (const skill of skills) {
    if (skillMap.has(skill.name)) {
      // Merge confidence scores for duplicate skills
      const existing = skillMap.get(skill.name);
      existing.confidence = Math.max(existing.confidence, skill.confidence);
      existing.frequency = (existing.frequency || 1) + 1;
    } else {
      skill.frequency = 1;
      skillMap.set(skill.name, skill);
    }
  }
  
  return Array.from(skillMap.values());
};

/**
 * Save extracted skills to database and update knowledge graph
 * @param {Array} skills - Array of extracted skills
 * @param {string} applicationId - Application ID
 * @returns {Array} Array of saved skills
 */
export const saveExtractedSkills = async (skills, applicationId) => {
  try {
    const savedSkills = [];
    
    for (const skillData of skills) {
      // Check if skill already exists
      let skill = await Skill.findOne({ name: skillData.name });
      
      if (skill) {
        // Update existing skill
        skill.frequency += 1;
        skill.lastUpdated = new Date();
        if (!skill.applications.includes(applicationId)) {
          skill.applications.push(applicationId);
        }
        await skill.save();
      } else {
        // Create new skill
        skill = await Skill.create({
          name: skillData.name,
          confidence: skillData.confidence,
          source: skillData.source,
          applications: [applicationId],
          frequency: 1
        });
      }
      
      savedSkills.push(skill);
    }
    
    return savedSkills;
    
  } catch (error) {
    console.error("Error saving extracted skills:", error);
    throw error;
  }
};

/**
 * Get all skills for a specific application
 * @param {string} applicationId - Application ID
 * @returns {Array} Array of skills
 */
export const getSkillsForApplication = async (applicationId) => {
  try {
    const skills = await Skill.find({ applications: applicationId });
    return skills;
  } catch (error) {
    console.error("Error getting skills for application:", error);
    return [];
  }
};

/**
 * Get all skills with their frequencies
 * @returns {Array} Array of skills with frequency data
 */
export const getAllSkills = async () => {
  try {
    const skills = await Skill.find({}).sort({ frequency: -1 });
    return skills;
  } catch (error) {
    console.error("Error getting all skills:", error);
    return [];
  }
}; 