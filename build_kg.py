import pandas as pd
import networkx as nx
from node2vec import Node2Vec
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
import json
import os

# -------------------------------
# Step 1: Load Jobs Dataset
# -------------------------------
def load_jobs_data(csv_path="jobs.csv"):
    """Load jobs data with proper error handling."""
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Jobs CSV file not found: {csv_path}")
    
    try:
        jobs = pd.read_csv(csv_path)
        required_columns = ['job_id', 'title', 'company', 'required_skills']
        missing_columns = [col for col in required_columns if col not in jobs.columns]
        
        if missing_columns:
            raise ValueError(f"Missing required columns: {missing_columns}")
        
        print(f"Loaded {len(jobs)} jobs from {csv_path}")
        return jobs
    except Exception as e:
        raise Exception(f"Error loading jobs data: {str(e)}")

# -------------------------------
# Step 2: Build Knowledge Graph
# -------------------------------
def build_knowledge_graph(jobs):
    """Build knowledge graph from jobs data."""
    G = nx.Graph()

    for _, row in jobs.iterrows():
        job_node = f"job_{row['job_id']}"
        company_node = f"company_{row['company']}"

        # Add Job Node
        G.add_node(job_node, type="job", title=row["title"], company=row["company"])

        # Add Company Node
        G.add_node(company_node, type="company", name=row["company"])
        G.add_edge(job_node, company_node, relation="POSTED_BY")

        # Add Skill Nodes - handle potential NaN values
        if pd.notna(row["required_skills"]):
            for skill in row["required_skills"].split(","):
                skill = skill.strip()
                if skill:  # Only add non-empty skills
                    skill_node = f"skill_{skill}"
                    G.add_node(skill_node, type="skill", name=skill)
                    G.add_edge(job_node, skill_node, relation="REQUIRES_SKILL")

    print(f"Knowledge Graph built: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges.")
    return G

# -------------------------------
# Step 3: Train Node2Vec Embeddings
# -------------------------------
def train_embeddings(G):
    """Train Node2Vec embeddings for the knowledge graph."""
    try:
        node2vec = Node2Vec(G, dimensions=32, walk_length=20, num_walks=50, workers=1, quiet=True)
        model = node2vec.fit(window=5, min_count=1)
        
        embeddings = {node: model.wv[node].tolist() for node in G.nodes()}
        print(f"Trained embeddings for {len(embeddings)} nodes")
        return embeddings
    except Exception as e:
        print(f"Warning: Could not train Node2Vec embeddings: {str(e)}")
        # Fallback to random embeddings
        embeddings = {node: np.random.normal(scale=0.01, size=32).tolist() for node in G.nodes()}
        print("Using random embeddings as fallback")
        return embeddings

def cosine_sim(vec1, vec2):
    """Calculate cosine similarity between two vectors."""
    v1 = np.array(vec1).reshape(1, -1)
    v2 = np.array(vec2).reshape(1, -1)
    return cosine_similarity(v1, v2)[0][0]

# -------------------------------
# Step 4: Query Functions (Jobs & Skills)
# -------------------------------
def query_job(job_id, G, embeddings, topn=5):
    """Query similar jobs based on job ID."""
    node = f"job_{job_id}"
    if node not in G:
        return {"error": f"Job '{job_id}' not found."}

    target_vec = embeddings[node]
    sims = []
    for other, vec in embeddings.items():
        if other != node and G.nodes[other]["type"] == "job":
            sim = cosine_sim(target_vec, vec)
            sims.append((other, sim))
    sims.sort(key=lambda x: x[1], reverse=True)
    top_jobs = [j.replace("job_", "") for j, _ in sims[:topn]]

    job_skills = [n.replace("skill_", "") for n in G.neighbors(node) if n.startswith("skill_")]

    similar_skills = {}
    for jid in top_jobs:
        jnode = f"job_{jid}"
        skills = [n.replace("skill_", "") for n in G.neighbors(jnode) if n.startswith("skill_")]
        similar_skills[jid] = skills

    return {
        "query_job": job_id,
        "skills": job_skills,
        "similar_jobs": top_jobs,
        "skills_of_similar_jobs": similar_skills
    }

def query_skill(skill_name, G, embeddings, topn=5):
    """Query related jobs and similar skills based on skill name."""
    node = f"skill_{skill_name}"
    if node not in G:
        return {"error": f"Skill '{skill_name}' not found."}

    target_vec = embeddings[node]
    sims = []
    for other, vec in embeddings.items():
        if other != node and G.nodes[other]["type"] == "skill":
            sim = cosine_sim(target_vec, vec)
            sims.append((other, sim))
    sims.sort(key=lambda x: x[1], reverse=True)
    top_skills = [s.replace("skill_", "") for s, _ in sims[:topn]]

    skill_jobs = [n.replace("job_", "") for n in G.neighbors(node) if n.startswith("job_")]

    jobs_for_similar = {}
    for sk in top_skills:
        snode = f"skill_{sk}"
        jobs = [n.replace("job_", "") for n in G.neighbors(snode) if n.startswith("job_")]
        jobs_for_similar[sk] = jobs

    return {
        "query_skill": skill_name,
        "related_jobs": skill_jobs,
        "similar_skills": top_skills,
        "jobs_for_similar_skills": jobs_for_similar
    }

# -------------------------------
# Step 5: Anomaly Detection
# -------------------------------
def check_anomaly(skill_name, target_name, G, embeddings, max_depth=3, sim_threshold=0.25):
    """
    Check if skill logically connects to a job or company.
    Uses:
    - Shortest path (<= max_depth)
    - Node2Vec cosine similarity (> sim_threshold)
    If either fails, it's marked as an anomaly.
    """
    skill_node = f"skill_{skill_name}"
    if f"job_{target_name}" in G:
        target_node = f"job_{target_name}"
    elif f"company_{target_name}" in G:
        target_node = f"company_{target_name}"
    else:
        return {"error": f"Target '{target_name}' not found."}

    if skill_node not in G:
        return {"error": f"Skill '{skill_name}' not found."}

    try:
        path_len = nx.shortest_path_length(G, skill_node, target_node)
    except nx.NetworkXNoPath:
        path_len = None

    sim = cosine_sim(embeddings[skill_node], embeddings[target_node])

    connected = (path_len is not None and path_len <= max_depth) and (sim >= sim_threshold)

    return {
        "skill": skill_name,
        "target": target_name,
        "path_length": path_len,
        "similarity": round(sim, 3),
        "connected": connected,
        "anomaly": not connected
    }

# -------------------------------
# Step 6: Main Execution
# -------------------------------
def main():
    """Main function to build KG and run example queries."""
    try:
        # Load data
        jobs = load_jobs_data()
        
        # Build KG
        G = build_knowledge_graph(jobs)
        
        # Train embeddings
        embeddings = train_embeddings(G)
        
        # Save KG and embeddings
        nx.write_gpickle(G, "careerhunt_kg.gpickle")
        with open("embeddings.json", "w") as f:
            json.dump(embeddings, f)
        print("Knowledge Graph and embeddings saved successfully!")
        
        # Run example queries
        job_result = query_job("1", G, embeddings)
        skill_result = query_skill("Python", G, embeddings)
        anomaly1 = check_anomaly("Blockchain", "1", G, embeddings)  # Skill vs Job
        anomaly2 = check_anomaly("React", "TechCorp", G, embeddings)  # Skill vs Company

        # Save results
        with open("job_query_result.json", "w") as f:
            json.dump(job_result, f, indent=2)
        with open("skill_query_result.json", "w") as f:
            json.dump(skill_result, f, indent=2)
        with open("anomaly_results.json", "w") as f:
            json.dump([anomaly1, anomaly2], f, indent=2)

        print("Results saved: job_query_result.json, skill_query_result.json, anomaly_results.json")
        
    except Exception as e:
        print(f"Error in main execution: {str(e)}")
        return False
    
    return True

if __name__ == "__main__":
    main()
