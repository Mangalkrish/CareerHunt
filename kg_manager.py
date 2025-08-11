import pandas as pd
import networkx as nx
from node2vec import Node2Vec
import numpy as np
import json
import schedule
import time
import os

# Load KG & embeddings if exist
try:
    G = nx.read_gpickle("careerhunt_kg.gpickle")
    with open("embeddings.json", "r") as f:
        embeddings = json.load(f)
    print(f"Loaded KG with {len(G.nodes())} nodes and {len(G.edges())} edges.")
except:
    G = nx.Graph()
    embeddings = {}
    print("No existing KG found. Starting fresh.")

# Track new nodes file
NEW_NODES_FILE = "new_nodes_log.json"
if not os.path.exists(NEW_NODES_FILE):
    with open(NEW_NODES_FILE, "w") as f:
        json.dump([], f)

def log_new_node(node_name, node_type):
    """Log added nodes so retrain knows what was added today."""
    with open(NEW_NODES_FILE, "r") as f:
        log = json.load(f)
    log.append({"node": node_name, "type": node_type})
    with open(NEW_NODES_FILE, "w") as f:
        json.dump(log, f)

def add_node_with_neighbors(node_name, node_type, neighbors):
    """
    Add a new node (job, skill, or company) with proper connections and approximate embeddings.
    Ensures the node is correctly placed in the KG.
    """
    # Validate node_type
    if node_type not in ["job", "skill", "company"]:
        raise ValueError(f"Invalid node type: {node_type}")

    # Add node
    G.add_node(node_name, type=node_type)

    # Ensure neighbors exist or create them as needed
    for n in neighbors:
        if n not in G:
            # Infer type from prefix (job_ / skill_ / company_)
            if n.startswith("job_"):
                G.add_node(n, type="job")
            elif n.startswith("skill_"):
                G.add_node(n, type="skill")
            elif n.startswith("company_"):
                G.add_node(n, type="company")
        G.add_edge(node_name, n)

    # Build approximate embedding
    valid_neighbors = [n for n in neighbors if n in embeddings]
    if valid_neighbors:
        neighbor_vecs = np.array([embeddings[n] for n in valid_neighbors])
        avg_vec = neighbor_vecs.mean(axis=0)
        embeddings[node_name] = avg_vec.tolist()
    else:
        embeddings[node_name] = np.random.normal(scale=0.01, size=32).tolist()

    # Log for nightly retrain
    log_new_node(node_name, node_type)

    print(f"[Realtime Update] Added '{node_name}' ({node_type}) connected to {neighbors}.")
    nx.write_gpickle(G, "careerhunt_kg.gpickle")
    with open("embeddings.json", "w") as f:
        json.dump(embeddings, f)


def nightly_retrain():
    print("\n[Nightly Retrain] Starting full KG rebuild...")
    jobs = pd.read_csv("jobs.csv")

    G_new = nx.Graph()
    for _, row in jobs.iterrows():
        job_node = f"job_{row['job_id']}"
        company_node = f"company_{row['company']}"
        G_new.add_node(job_node, type="job", title=row["title"], company=row["company"])
        G_new.add_node(company_node, type="company", name=row["company"])
        G_new.add_edge(job_node, company_node, relation="POSTED_BY")

        for skill in row["required_skills"].split(","):
            skill = skill.strip()
            skill_node = f"skill_{skill}"
            G_new.add_node(skill_node, type="skill", name=skill)
            G_new.add_edge(job_node, skill_node, relation="REQUIRES_SKILL")

    print(f"Rebuilt KG: {G_new.number_of_nodes()} nodes, {G_new.number_of_edges()} edges.")

    node2vec = Node2Vec(G_new, dimensions=32, walk_length=20, num_walks=50, workers=1, quiet=True)
    model = node2vec.fit(window=5, min_count=1)
    new_embeddings = {node: model.wv[node].tolist() for node in G_new.nodes()}

    nx.write_gpickle(G_new, "careerhunt_kg.gpickle")
    with open("embeddings.json", "w") as f:
        json.dump(new_embeddings, f)

    # Reset memory
    global G, embeddings
    G, embeddings = G_new, new_embeddings

    # Clear new nodes log
    with open(NEW_NODES_FILE, "w") as f:
        json.dump([], f)

    print("[Nightly Retrain] Complete. KG & embeddings refreshed!\n")

schedule.every().day.at("01:23").do(nightly_retrain)

print("KG Manager running. Realtime updates enabled. Full retrain at 01:23 AM.")

while True:
    schedule.run_pending()
    time.sleep(60)
