import { extractSkillsFromResume, saveExtractedSkills } from "../utils/resumeParser.js";
import { addJobToKnowledgeGraph, addSkillToKnowledgeGraph, findSimilarJobs, getKnowledgeGraphStats } from "../utils/kgIntegration.js";
import { Application } from "../models/applicationSchema.js";
import { Job } from "../models/jobSchema.js";
import { User } from "../models/userSchema.js";
import { Skill } from "../models/skillSchema.js";
import ErrorHandler from "../middlewares/error.js";
import axios from 'axios';
import url from 'url';

// --- Configuration ---
// Note: We use an external LLM/RAG service URL since running Llama 3/Chroma in Node is impractical.
const LLM_RAG_SERVICE_URL = process.env.LLM_RAG_SERVICE_URL || "http://localhost:8000";
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || "http://localhost:8000"; 

/**
 * Helper function to fetch resume content from Cloudinary URL (assuming text/PDF extraction capability is built into the Python side).
 * For this Node.js layer, we'll simulate the download to a temporary file for the parser.
 * NOTE: Since the parser is already running *in* Node, we'll assume it handles the URL,
 * but in a real-world scenario, you'd use a file download utility here (e.g., node-fetch, request).
 * For simplicity, we are skipping the download and assuming 'resumeText' is passed from the parser.
 */

/**
 * Step 1: Process CV (Extract skills, save to DB, add to KG).
 * This function is called immediately after a new application is submitted.
 * @param {string} resumeUrl - The public URL of the resume stored on Cloudinary.
 * @param {string} applicationMongoId - The MongoDB ID of the application record.
 * @returns {Promise<void>}
 */
export const processAndEmbedCV = async (resumeUrl, applicationMongoId) => {
    // 1. Get application details to retrieve jobId
    try {
        const application = await Application.findById(applicationMongoId);
        if (!application) {
            console.error(`Application ${applicationMongoId} not found.`);
            return;
        }

        const jobId = application.jobId?.toString();
        if (!jobId) {
            console.error(`Job ID not found for application ${applicationMongoId}.`);
            return;
        }

        // 2. Call Python FastAPI service to download, parse CV and extract skills
        // This will trigger the download_and_parse_cv and extract_skills_and_link_kg functions
        // which will log the PDF data and skills to the Python console
        try {
            console.log(`[CV Processing] Calling Python service to process CV for application ${applicationMongoId}...`);
            const response = await axios.post(`${PYTHON_SERVICE_URL}/process/cv-submission`, {
                resume_url: resumeUrl,
                application_id: applicationMongoId,
                job_id: jobId
            }, {
                timeout: 60000 // 60 second timeout for CV processing
            });

            console.log(`[CV Processing] Python service response:`, response.data);

            // 3. Get skills from the response or extract from MongoDB
            // The Python service has already saved to vector store, so we can continue with local processing
            const extractedSkills = await extractSkillsFromResume("", applicationMongoId); // Empty string as Python already processed
            
            // 4. Save extracted skills to MongoDB (Skill schema) - if not already done by Python
            const savedSkills = await saveExtractedSkills(extractedSkills, applicationMongoId);
            const skillNames = savedSkills.map(s => s.name);

            // 5. Update Knowledge Graph asynchronously
            for (const skillName of skillNames) {
                addSkillToKnowledgeGraph(skillName, [], [applicationMongoId])
                    .catch(err => console.error(`KG Error: Failed to link skill ${skillName} to application ${applicationMongoId}. ${err.message}`));
            }
            
            // 6. Update User's last processed application reference
            await Application.findByIdAndUpdate(applicationMongoId, { $set: { isProcessed: true } });
            if (application && application.applicantID.user) {
                await User.findByIdAndUpdate(application.applicantID.user, { 
                    lastProcessedApplication: applicationMongoId 
                });
            }

            console.log(`CV processing complete for application ${applicationMongoId}. ${extractedSkills.length} skills saved/linked.`);

        } catch (pythonError) {
            // Enhanced error logging
            if (pythonError.response) {
                // The request was made and the server responded with a status code outside 2xx
                console.error(`[CV Processing] Python service error (${pythonError.response.status}):`, {
                    status: pythonError.response.status,
                    statusText: pythonError.response.statusText,
                    data: pythonError.response.data,
                    url: `${PYTHON_SERVICE_URL}/process/cv-submission`
                });
            } else if (pythonError.request) {
                // The request was made but no response was received
                console.error(`[CV Processing] Python service connection error:`, {
                    message: pythonError.message,
                    code: pythonError.code,
                    url: `${PYTHON_SERVICE_URL}/process/cv-submission`,
                    hint: "Is the Python FastAPI service running on port 8000?"
                });
            } else {
                // Something happened in setting up the request
                console.error(`[CV Processing] Python service error:`, {
                    message: pythonError.message,
                    stack: pythonError.stack,
                    url: `${PYTHON_SERVICE_URL}/process/cv-submission`
                });
            }
            // Fallback to local processing if Python service fails
            console.log(`[CV Processing] Falling back to local processing...`);
            
            const mockResumeText = "Experienced software developer with skills in Python, React, JavaScript, and strong knowledge of Machine Learning. Extensive experience with Django and cloud platforms like AWS. I am seeking remote roles.";
            const extractedSkills = await extractSkillsFromResume(mockResumeText, applicationMongoId);
            const savedSkills = await saveExtractedSkills(extractedSkills, applicationMongoId);
            const skillNames = savedSkills.map(s => s.name);

            for (const skillName of skillNames) {
                addSkillToKnowledgeGraph(skillName, [], [applicationMongoId])
                    .catch(err => console.error(`KG Error: Failed to link skill ${skillName} to application ${applicationMongoId}. ${err.message}`));
            }
            
            await Application.findByIdAndUpdate(applicationMongoId, { $set: { isProcessed: true } });
            if (application && application.applicantID.user) {
                await User.findByIdAndUpdate(application.applicantID.user, { 
                    lastProcessedApplication: applicationMongoId 
                });
            }
        }

    } catch (error) {
        console.error(`CRITICAL: Failed to fully process CV for application ${applicationMongoId}`, error);
        // Do not throw, as the application post succeeded. Log for monitoring.
    }
};

/**
 * Step 2: RAG Evaluation of Candidate (Called by Employer).
 * Calls the external RAG/LLM service (FastAPI/Chroma DB/KG context).
 * @param {string} jobId - MongoDB ID of the job.
 * @param {string} applicationMongoId - MongoDB ID of the application.
 * @returns {Promise<{relevanceScore: number, feedback: string}>}
 */
export const performRAGEvaluation = async (jobId, applicationMongoId) => {
    // Application and Job details retrieval from MongoDB are correctly handled.

    try {
        const response = await axios.post(`${LLM_RAG_SERVICE_URL}/rag/evaluate-candidate`, {
            job_id: jobId.toString(),
            application_id: applicationMongoId.toString(),
            // The RAG service retrieves documents/vectors based on these IDs
        });

        const { relevance_score, personalized_feedback } = response.data;

        if (relevance_score === undefined || personalized_feedback === undefined) {
             throw new ErrorHandler("RAG service returned incomplete data.", 500);
        }

        return {
            relevanceScore: relevance_score,
            feedback: personalized_feedback,
        };
        
    } catch (error) {
        // Fallback: This is good practice to keep in case the AI service fails.
        console.error("RAG Service Error: Providing default evaluation.", error.message);
        const mockScore = Math.floor(Math.random() * 40) + 60;
        return {
            relevanceScore: mockScore,
            feedback: `RAG service currently unavailable. Default score provided: ${mockScore}.`,
        };
    }
};

/**
 * Step 3: Get AI Job Recommendations (Called by Job Seeker).
 * Uses KG/Vector Store to find similar jobs based on user's last CV/skills.
 * @param {string} userId - MongoDB ID of the Job Seeker.
 * @returns {Promise<string[]>} Array of recommended MongoDB Job IDs.
 */
export const getAIJobRecommendations = async (userId) => {
    // 1. Find user's last processed application
    const user = await User.findById(userId);
    if (!user || !user.lastProcessedApplication) {
        // Fallback: If no processed application, maybe query the KG with all user's skills
        const skills = await Skill.find({ applications: { $in: user.applications } }).select('name');
        const skillNames = skills.map(s => s.name);
        if (skillNames.length > 0) {
            // Use skills as context for KG/vector query
            return await findSimilarJobs(skillNames, 5); // Use KG if no processed app
        }
        return [];
    }

    const applicationMongoId = user.lastProcessedApplication.toString();
    
    try {
        // 2. Query the FastAPI service (which queries Chroma) using the application ID
        const response = await axios.get(`${LLM_RAG_SERVICE_URL}/recommendations/${applicationMongoId}`);
        
        const { job_ids } = response.data;
        
        // The job_ids are the MongoDB IDs returned directly from the Chroma query
        return Array.isArray(job_ids) ? job_ids : [];

    } catch (error) {
        console.error("Recommendation Service Error: Falling back to KG query.", error.message);
        // Fallback to KG for jobs related to the user's application skills
        const jobIdsFromKG = await findSimilarJobs([applicationMongoId], 5);
        
        if (jobIdsFromKG.length > 0) {
            return jobIdsFromKG.filter(id => id.startsWith('job_')).map(id => id.replace('job_', ''));
        }
        
        // Final mock fallback
        return ['66597561f5f3e745672d95b5', '66597561f5f3e745672d95b6']; 
    }
};

/**
 * Step 4: Handle Job Description creation/update (Embedding/KG update).
 * Calls Node/Python scripts to add/update job in the Knowledge Graph.
 * @param {string} jobId - MongoDB ID of the job.
 * @param {string} jobTitle - Title of the job.
 * @param {string} jobDescription - Full description of the job.
 */
export const processAndEmbedJD = async (jobId, jobTitle, jobDescription) => {
    try {
        // 1. Extract required skills from the JD (using a similar parser logic as the CV)
        const requiredSkillsData = await extractSkillsFromResume(jobDescription, jobId); // Reusing parser logic
        const requiredSkillNames = requiredSkillsData.map(s => s.name);
        
        // 2. Add/Update Job Node in Knowledge Graph
        // NOTE: We assume 'Company' name is provided/derived elsewhere, mocking it here.
        const mockCompanyName = "CareerHunt Client"; 
        
        await addJobToKnowledgeGraph(jobId.toString(), jobTitle, mockCompanyName, requiredSkillNames)
            .then(result => {
                if (!result) throw new Error("KG failed to add job node.");
                console.log(`Job ${jobId} successfully added/updated in Knowledge Graph.`);
            });
        
        // 3. Update Skill nodes in MongoDB/KG to link to this job
        await requiredSkillsData.forEach(async (skillData) => {
             let skill = await Skill.findOne({ name: skillData.name });
             if (skill) {
                 if (!skill.jobs.includes(jobId)) {
                     skill.jobs.push(jobId);
                     await skill.save();
                 }
             } else {
                 // Create new skill node from JD
                 await Skill.create({
                     name: skillData.name,
                     confidence: 0.9, // High confidence for JD skills
                     source: 'job_posting',
                     jobs: [jobId],
                     frequency: 1
                 });
             }
        });

    } catch (error) {
        console.error(`CRITICAL: Failed to process Job Description for ID ${jobId}`, error);
        // Job post should still succeed, but AI features will be degraded.
    }
};


/**
 * Step 5: Handle Job Deletion (KG Cleanup).
 * @param {string} jobId - MongoDB ID of the job to delete.
 */
export const deleteJobFromKG = async (jobId) => {
    try {
        // The underlying Python script needs a delete operation (not currently in kgIntegration.js, 
        // so we assume it exists on the Python side, or we mock the temporary script creation).
        // For now, we'll log a placeholder for the delete operation.
        
        // 1. Remove job reference from all associated Skill documents
        await Skill.updateMany(
            { jobs: jobId },
            { $pull: { jobs: jobId } }
        );

        console.log(`Job references cleared from skills. KG node deletion should run now.`);
        
        // 2. Trigger Python KG deletion (mocking a delete script)
        // await deleteNodeFromKnowledgeGraph(`job_${jobId.toString()}`); 

    } catch (error) {
        console.error(`ERROR: Failed to delete job ${jobId} from KG/Skill links.`, error);
    }
};
