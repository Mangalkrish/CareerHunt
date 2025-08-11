import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the Python knowledge graph scripts
const KG_SCRIPTS_DIR = path.join(__dirname, '..', '..');
const BUILD_KG_SCRIPT = path.join(KG_SCRIPTS_DIR, 'build_kg.py');
const KG_MANAGER_SCRIPT = path.join(KG_SCRIPTS_DIR, 'kg_manager.py');

/**
 * Add a new skill node to the knowledge graph
 * @param {string} skillName - Name of the skill
 * @param {Array} relatedSkills - Array of related skill names
 * @param {Array} relatedJobs - Array of related job IDs
 * @returns {Promise<boolean>} Success status
 */
export const addSkillToKnowledgeGraph = async (skillName, relatedSkills = [], relatedJobs = []) => {
  try {
    // Create a temporary Python script to add the skill
    const tempScript = createTempAddSkillScript(skillName, relatedSkills, relatedJobs);
    
    // Execute the Python script
    const result = await executePythonScript(tempScript);
    
    // Clean up temporary file
    fs.unlinkSync(tempScript);
    
    return result;
  } catch (error) {
    console.error('Error adding skill to knowledge graph:', error);
    return false;
  }
};

/**
 * Add a new job node to the knowledge graph
 * @param {string} jobId - Job ID
 * @param {string} jobTitle - Job title
 * @param {string} companyName - Company name
 * @param {Array} requiredSkills - Array of required skill names
 * @returns {Promise<boolean>} Success status
 */
export const addJobToKnowledgeGraph = async (jobId, jobTitle, companyName, requiredSkills = []) => {
  try {
    // Create a temporary Python script to add the job
    const tempScript = createTempAddJobScript(jobId, jobTitle, companyName, requiredSkills);
    
    // Execute the Python script
    const result = await executePythonScript(tempScript);
    
    // Clean up temporary file
    fs.unlinkSync(tempScript);
    
    return result;
  } catch (error) {
    console.error('Error adding job to knowledge graph:', error);
    return false;
  }
};

/**
 * Query the knowledge graph for similar jobs based on skills
 * @param {Array} skills - Array of skill names
 * @param {number} limit - Maximum number of jobs to return
 * @returns {Promise<Array>} Array of similar jobs
 */
export const findSimilarJobs = async (skills, limit = 5) => {
  try {
    // Create a temporary Python script to query the KG
    const tempScript = createTempQueryScript('jobs', skills, limit);
    
    // Execute the Python script
    const result = await executePythonScript(tempScript);
    
    // Clean up temporary file
    fs.unlinkSync(tempScript);
    
    return result;
  } catch (error) {
    console.error('Error querying knowledge graph for similar jobs:', error);
    return [];
  }
};

/**
 * Query the knowledge graph for related skills
 * @param {Array} skills - Array of skill names
 * @param {number} limit - Maximum number of skills to return
 * @returns {Promise<Array>} Array of related skills
 */
export const findRelatedSkills = async (skills, limit = 5) => {
  try {
    // Create a temporary Python script to query the KG
    const tempScript = createTempQueryScript('skills', skills, limit);
    
    // Execute the Python script
    const result = await executePythonScript(tempScript);
    
    // Clean up temporary file
    fs.unlinkSync(tempScript);
    
    return result;
  } catch (error) {
    console.error('Error querying knowledge graph for related skills:', error);
    return [];
  }
};

/**
 * Create a temporary Python script to add a skill to the KG
 */
const createTempAddSkillScript = (skillName, relatedSkills, relatedJobs) => {
  const script = `
import sys
import os
sys.path.append('${KG_SCRIPTS_DIR}')

try:
    from kg_manager import add_node_with_neighbors
    
    # Add the skill node
    neighbors = []
    
    # Add related skills
    for skill in ${JSON.stringify(relatedSkills)}:
        neighbors.append(f"skill_{skill}")
    
    # Add related jobs
    for job in ${JSON.stringify(relatedJobs)}:
        neighbors.append(f"job_{job}")
    
    # Add the skill to the knowledge graph
    success = add_node_with_neighbors(f"skill_{skillName}", "skill", neighbors)
    
    if success:
        print("SUCCESS: Skill added to knowledge graph")
        sys.exit(0)
    else:
        print("ERROR: Failed to add skill to knowledge graph")
        sys.exit(1)
        
except Exception as e:
    print(f"ERROR: {str(e)}")
    sys.exit(1)
`;

  const tempFile = path.join(__dirname, `temp_add_skill_${Date.now()}.py`);
  fs.writeFileSync(tempFile, script);
  return tempFile;
};

/**
 * Create a temporary Python script to add a job to the KG
 */
const createTempAddJobScript = (jobId, jobTitle, companyName, requiredSkills) => {
  const script = `
import sys
import os
sys.path.append('${KG_SCRIPTS_DIR}')

try:
    from kg_manager import add_node_with_neighbors
    
    # Add the job node
    neighbors = []
    
    # Add company
    neighbors.append(f"company_{companyName}")
    
    # Add required skills
    for skill in ${JSON.stringify(requiredSkills)}:
        neighbors.append(f"skill_{skill}")
    
    # Add the job to the knowledge graph
    success = add_node_with_neighbors(f"job_{jobId}", "job", neighbors)
    
    if success:
        print("SUCCESS: Job added to knowledge graph")
        sys.exit(0)
    else:
        print("ERROR: Failed to add job to knowledge graph")
        sys.exit(1)
        
except Exception as e:
    print(f"ERROR: {str(e)}")
    sys.exit(1)
`;

  const tempFile = path.join(__dirname, `temp_add_job_${Date.now()}.py`);
  fs.writeFileSync(tempFile, script);
  return tempFile;
};

/**
 * Create a temporary Python script to query the KG
 */
const createTempQueryScript = (queryType, skills, limit) => {
  const script = `
import sys
import os
import json
sys.path.append('${KG_SCRIPTS_DIR}')

try:
    from build_kg import query_job, query_skill
    import networkx as nx
    
    # Load the knowledge graph
    if os.path.exists('careerhunt_kg.gpickle'):
        G = nx.read_gpickle('careerhunt_kg.gpickle')
        with open('embeddings.json', 'r') as f:
            embeddings = json.load(f)
    else:
        print("ERROR: Knowledge graph not found")
        sys.exit(1)
    
    results = []
    
    if query_type == 'jobs':
        # Find similar jobs based on skills
        for skill in ${JSON.stringify(skills)}:
            try:
                result = query_skill(skill, G, embeddings, ${limit})
                if 'error' not in result:
                    results.append(result)
            except:
                continue
    elif query_type == 'skills':
        # Find related skills
        for skill in ${JSON.stringify(skills)}:
            try:
                result = query_skill(skill, G, embeddings, ${limit})
                if 'error' not in result:
                    results.append(result)
            except:
                continue
    
    # Output results as JSON
    print(json.dumps(results))
    sys.exit(0)
    
except Exception as e:
    print(f"ERROR: {str(e)}")
    sys.exit(1)
`;

  const tempFile = path.join(__dirname, `temp_query_${Date.now()}.py`);
  fs.writeFileSync(tempFile, script);
  return tempFile;
};

/**
 * Execute a Python script and return the result
 */
const executePythonScript = (scriptPath) => {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python3', [scriptPath]);
    
    let output = '';
    let errorOutput = '';
    
    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      if (code === 0) {
        try {
          // Try to parse JSON output
          if (output.trim().startsWith('[') || output.trim().startsWith('{')) {
            const result = JSON.parse(output.trim());
            resolve(result);
          } else {
            // Check for success message
            if (output.includes('SUCCESS:')) {
              resolve(true);
            } else {
              resolve(output.trim());
            }
          }
        } catch (e) {
          resolve(output.trim());
        }
      } else {
        reject(new Error(`Python script failed with code ${code}: ${errorOutput}`));
      }
    });
    
    pythonProcess.on('error', (error) => {
      reject(new Error(`Failed to start Python process: ${error.message}`));
    });
  });
};

/**
 * Initialize the knowledge graph with existing data
 * @returns {Promise<boolean>} Success status
 */
export const initializeKnowledgeGraph = async () => {
  try {
    // Check if KG already exists
    const kgFile = path.join(KG_SCRIPTS_DIR, 'careerhunt_kg.gpickle');
    const embeddingsFile = path.join(KG_SCRIPTS_DIR, 'embeddings.json');
    
    if (fs.existsSync(kgFile) && fs.existsSync(embeddingsFile)) {
      console.log('Knowledge graph already exists, skipping initialization');
      return true;
    }
    
    // Run the build_kg.py script
    const result = await executePythonScript(BUILD_KG_SCRIPT);
    return result !== false;
    
  } catch (error) {
    console.error('Error initializing knowledge graph:', error);
    return false;
  }
};

/**
 * Get knowledge graph statistics
 * @returns {Promise<Object>} KG statistics
 */
export const getKnowledgeGraphStats = async () => {
  try {
    const kgFile = path.join(KG_SCRIPTS_DIR, 'careerhunt_kg.gpickle');
    const embeddingsFile = path.join(KG_SCRIPTS_DIR, 'embeddings.json');
    
    if (!fs.existsSync(kgFile) || !fs.existsSync(embeddingsFile)) {
      return { error: 'Knowledge graph not found' };
    }
    
    // Create a temporary script to get stats
    const script = `
import sys
import os
import networkx as nx
import json
sys.path.append('${KG_SCRIPTS_DIR}')

try:
    G = nx.read_gpickle('careerhunt_kg.gpickle')
    with open('embeddings.json', 'r') as f:
        embeddings = json.load(f)
    
    stats = {
        'total_nodes': G.number_of_nodes(),
        'total_edges': G.number_of_edges(),
        'job_nodes': len([n for n in G.nodes() if G.nodes[n].get('type') == 'job']),
        'skill_nodes': len([n for n in G.nodes() if G.nodes[n].get('type') == 'skill']),
        'company_nodes': len([n for n in G.nodes() if G.nodes[n].get('type') == 'company']),
        'embeddings_count': len(embeddings)
    }
    
    print(json.dumps(stats))
    
except Exception as e:
    print(json.dumps({'error': str(e)}))
`;

    const tempFile = path.join(__dirname, `temp_stats_${Date.now()}.py`);
    fs.writeFileSync(tempFile, script);
    
    const result = await executePythonScript(tempFile);
    fs.unlinkSync(tempFile);
    
    return result;
    
  } catch (error) {
    console.error('Error getting knowledge graph stats:', error);
    return { error: error.message };
  }
}; 