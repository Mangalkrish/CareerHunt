# CareerHunt Knowledge Graph System

This system provides a knowledge graph-based approach to career matching, job recommendations, and skill analysis for the CareerHunt project. **Now with integrated resume processing and automatic skill extraction!**

## Overview

The system consists of multiple components that work together:
1. **`build_kg.py`** - Initial knowledge graph construction and training
2. **`kg_manager.py`** - Real-time updates and scheduled maintenance
3. **Backend Integration** - Resume processing, skill extraction, and API endpoints
4. **Knowledge Graph Queries** - Job matching and skill recommendations

## Features

- **🔄 Resume Processing**: Automatic skill extraction from uploaded resumes
- **🎯 Job-Skill Matching**: Find jobs based on skills and vice versa
- **🔍 Similarity Analysis**: Discover similar jobs and related skills
- **🚨 Anomaly Detection**: Identify unusual skill-job combinations
- **⚡ Real-time Updates**: Add new nodes dynamically as resumes are processed
- **📅 Scheduled Retraining**: Automatic nightly graph refresh
- **🌐 REST API**: Full backend integration with your CareerHunt webapp

## Architecture

```
Resume Upload → Skill Extraction → Knowledge Graph Update → Job Recommendations
     ↓              ↓                    ↓                    ↓
Cloudinary    NLP Processing      Python KG Scripts    API Endpoints
```

## Setup

### 1. Install Dependencies

**Python Dependencies:**
```bash
pip install -r requirements.txt
```

**Node.js Dependencies:**
```bash
cd backend
npm install
```

### 2. Prepare Your Data

Create a `jobs.csv` file with your initial job data (see `sample_jobs.csv` for structure):
- `job_id`: Unique identifier for each job
- `title`: Job title
- `company`: Company name
- `required_skills`: Comma-separated list of required skills

### 3. Initialize the Knowledge Graph

```bash
python build_kg.py
```

This will:
- Load your jobs data
- Build the knowledge graph
- Train Node2Vec embeddings
- Save the graph and embeddings to files

## Usage

### Backend API Integration

The system now provides REST API endpoints for seamless integration:

#### **Skill Management**
- `GET /api/v1/skills/all` - Get all skills with frequencies
- `GET /api/v1/skills/search?query=python` - Search skills by name
- `GET /api/v1/skills/top?limit=20` - Get top skills by frequency
- `GET /api/v1/skills/stats` - Get knowledge graph statistics

#### **Job Matching**
- `POST /api/v1/skills/find-jobs` - Find jobs based on skills
- `POST /api/v1/skills/find-related` - Find related skills
- `POST /api/v1/skills/recommendations` - Get skill recommendations for target jobs

#### **Application Skills**
- `GET /api/v1/skills/application/:applicationId` - Get skills for specific application

### Resume Processing

When a user uploads a resume through your CareerHunt webapp:

1. **Resume Upload**: File is uploaded to Cloudinary
2. **Skill Extraction**: NLP processing extracts skills from resume text
3. **Database Storage**: Skills are saved with confidence scores
4. **Knowledge Graph Update**: New skills are added to the KG in real-time
5. **Job Matching**: Users can immediately find matching jobs

### Example API Usage

#### Find Jobs by Skills
```javascript
const response = await fetch('/api/v1/skills/find-jobs', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    skills: ['python', 'react', 'node.js'],
    limit: 10
  })
});

const { similarJobs } = await response.json();
```

#### Get Skill Recommendations
```javascript
const response = await fetch('/api/v1/skills/recommendations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    targetJob: 'Software Engineer',
    currentSkills: ['python', 'javascript'],
    limit: 5
  })
});

const { recommendedSkills } = await response.json();
```

### Real-time Management

Start the knowledge graph manager for real-time updates:
```bash
python kg_manager.py
```

This will:
- Load existing knowledge graph
- Enable real-time node additions from resume processing
- Schedule nightly retraining at 01:23 AM

## Data Flow

1. **Initial Build**: `build_kg.py` creates the initial knowledge graph
2. **Resume Upload**: User uploads resume through CareerHunt webapp
3. **Skill Extraction**: NLP processes resume and extracts skills
4. **Real-time Updates**: `kg_manager.py` adds new skills to the graph
5. **Query Interface**: API endpoints provide job-skill matching capabilities
6. **Scheduled Maintenance**: Nightly retraining ensures graph quality

## Integration with CareerHunt

### Frontend Integration

```javascript
// Example: Resume upload with skill extraction
const uploadResume = async (formData) => {
  const response = await fetch('/api/v1/application/post', {
    method: 'POST',
    body: formData
  });
  
  const { application, extractedSkills } = await response.json();
  
  // Show extracted skills to user
  displayExtractedSkills(extractedSkills);
  
  // Offer to find matching jobs
  const matchingJobs = await findJobsBySkills(extractedSkills.map(s => s.name));
  displayMatchingJobs(matchingJobs);
};
```

### Backend Integration

The system automatically:
- Processes resumes when applications are submitted
- Extracts skills using advanced NLP techniques
- Updates the knowledge graph in real-time
- Provides job matching through REST APIs

## Skill Extraction Features

### **Technical Skills Detected**
- Programming Languages: Python, JavaScript, Java, C++, C#, PHP, Ruby, Go, Rust, Swift, Kotlin
- Web Technologies: HTML, CSS, SQL, NoSQL databases
- Frameworks: React, Angular, Vue, Django, Flask, Spring, Node.js
- Cloud & DevOps: AWS, Azure, GCP, Docker, Kubernetes, Jenkins
- Data Science: Machine Learning, Statistics, R, TensorFlow, PyTorch
- Tools: Figma, Adobe Suite, Jira, Confluence, Git

### **Soft Skills Detected**
- Leadership, Communication, Problem Solving
- Teamwork, Agile, Project Management
- Time Management, Organization, Creativity
- Adaptability, Customer Service, Sales

### **Confidence Scoring**
Skills are scored based on:
- Frequency in resume
- Context (skills section, experience mentions)
- Technical vs. soft skill classification
- Years of experience indicators

## Error Handling

The system includes comprehensive error handling for:
- Missing or malformed resume files
- Skill extraction failures
- Knowledge graph update errors
- API request validation
- Database connection issues

## Performance Considerations

- **Skill Extraction**: Optimized NLP processing with confidence scoring
- **Knowledge Graph**: Efficient Node2Vec embeddings with fallback options
- **API Response**: Cached skill queries and optimized database queries
- **Real-time Updates**: Asynchronous processing to maintain responsiveness

## Troubleshooting

### Common Issues

1. **Skills Not Extracted**: Check resume text quality and format
2. **Knowledge Graph Errors**: Verify Python dependencies and file permissions
3. **API Failures**: Check authentication and request format
4. **Performance Issues**: Monitor database indexes and query optimization

### Debug Mode

Enable detailed logging:
```bash
export DEBUG=true
python kg_manager.py
```

## Future Enhancements

- **Advanced NLP**: Integration with GPT models for better skill extraction
- **Resume Parsing**: Support for PDF, Word, and other document formats
- **Skill Validation**: Cross-reference with job market data
- **Learning Paths**: Personalized skill development recommendations
- **Market Analysis**: Skill demand trends and salary insights
- **AI Chatbot**: Interactive career guidance using the knowledge graph

## API Documentation

For complete API documentation, see the backend routes and controllers. All endpoints include:
- Request/response schemas
- Authentication requirements
- Error handling
- Rate limiting
- CORS configuration

## Support

The system is designed to be self-maintaining with:
- Automatic error recovery
- Comprehensive logging
- Health check endpoints
- Performance monitoring
- Automated testing

---

**Ready to transform your CareerHunt project with intelligent skill-based job matching! 🚀**