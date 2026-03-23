#!/usr/bin/env python3
"""
End-to-end test for AI Spy Game — Multi-Agent Feature
Tests: User adds multiple agents to same room, game runs with mixed ownership
"""

import requests
import time
import json
import sys

BASE = "http://localhost:3001/api"
PASS = 0
FAIL = 0

def test(name, condition, detail=""):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  ✅ {name}")
    else:
        FAIL += 1
        print(f"  ❌ {name} — {detail}")

def section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")

ts = int(time.time())

# ============================================================
# 1. SETUP - Register 2 users, each with 3 agents
# ============================================================
section("1. SETUP - Users & Agents")

users = []
user_agents = {}  # userId -> list of agent dicts

for i in range(1, 3):
    r = requests.post(f"{BASE}/auth/register", json={
        "username": f"multitest{i}_{ts}",
        "password": "password123",
        "nickname": f"User {i}"
    })
    data = r.json()
    test(f"Register user {i}", r.status_code == 201, f"got {r.status_code}: {data}")
    users.append({"token": data.get("token"), "user": data.get("user", {})})

# Create 3 agents per user
for ui, u in enumerate(users):
    headers = {"Authorization": f"Bearer {u['token']}"}
    agents = []
    for ai in range(1, 4):
        r = requests.post(f"{BASE}/agents", headers=headers, json={
            "name": f"U{ui+1}-Agent{ai}",
            "model": "gpt-4",
            "system_prompt": f"You are agent {ai} of user {ui+1}.",
            "temperature": 0.7,
            "top_p": 0.9,
            "max_tokens": 300,
        })
        data = r.json()
        test(f"Create U{ui+1}-Agent{ai}", r.status_code == 201, f"got {r.status_code}")
        agents.append(data.get("agent", {}))
    user_agents[ui] = agents

# ============================================================
# 2. MULTI-AGENT ROOM - User 1 creates room, adds 3 agents
# ============================================================
section("2. MULTI-AGENT ROOM")

h1 = {"Authorization": f"Bearer {users[0]['token']}"}
h2 = {"Authorization": f"Bearer {users[1]['token']}"}

# User 1 creates room with first agent
r = requests.post(f"{BASE}/rooms", headers=h1, json={
    "room_name": "Multi-Agent Test",
    "config": {"max_players": 8, "spy_count": 1, "has_blank": False, "max_rounds": 3, "min_players": 4},
    "agent_id": user_agents[0][0]["id"]
})
data = r.json()
test("Create room with agent 1", r.status_code == 201, f"got {r.status_code}: {data}")
room_id = data.get("room", {}).get("id")

# Verify User 1's first agent is in room
r = requests.get(f"{BASE}/rooms/{room_id}", headers=h1)
room_data = r.json().get("room", {})
players = room_data.get("players", [])
test("Room has 1 player initially", len(players) == 1, f"got {len(players)}")
test("Player is U1-Agent1", players[0]["agent_name"] == "U1-Agent1" if players else False,
     f"got {players[0].get('agent_name') if players else 'empty'}")

# User 1 adds 2nd agent
r = requests.post(f"{BASE}/rooms/{room_id}/join", headers=h1, json={
    "agent_id": user_agents[0][1]["id"]
})
test("User 1 add 2nd agent", r.status_code == 200, f"got {r.status_code}: {r.json()}")

# User 1 adds 3rd agent
r = requests.post(f"{BASE}/rooms/{room_id}/join", headers=h1, json={
    "agent_id": user_agents[0][2]["id"]
})
test("User 1 add 3rd agent", r.status_code == 200, f"got {r.status_code}: {r.json()}")

# Verify room now has 3 players, all from User 1
r = requests.get(f"{BASE}/rooms/{room_id}", headers=h1)
room_data = r.json().get("room", {})
players = room_data.get("players", [])
test("Room has 3 players", len(players) == 3, f"got {len(players)}")
u1_players = [p for p in players if p["user_id"] == users[0]["user"]["id"]]
test("All 3 belong to User 1", len(u1_players) == 3, f"got {len(u1_players)}")

# Try to add the SAME agent again — should fail
r = requests.post(f"{BASE}/rooms/{room_id}/join", headers=h1, json={
    "agent_id": user_agents[0][0]["id"]
})
test("Duplicate agent rejected", r.status_code == 400, f"got {r.status_code}: {r.json()}")

# ============================================================
# 3. USER 2 JOINS - adds 2 agents
# ============================================================
section("3. USER 2 JOINS")

r = requests.post(f"{BASE}/rooms/{room_id}/join", headers=h2, json={
    "agent_id": user_agents[1][0]["id"]
})
test("User 2 add 1st agent", r.status_code == 200, f"got {r.status_code}")

r = requests.post(f"{BASE}/rooms/{room_id}/join", headers=h2, json={
    "agent_id": user_agents[1][1]["id"]
})
test("User 2 add 2nd agent", r.status_code == 200, f"got {r.status_code}")

# Verify 5 total
r = requests.get(f"{BASE}/rooms/{room_id}", headers=h1)
players = r.json().get("room", {}).get("players", [])
test("Room has 5 players total", len(players) == 5, f"got {len(players)}")
u2_players = [p for p in players if p["user_id"] == users[1]["user"]["id"]]
test("User 2 has 2 agents", len(u2_players) == 2, f"got {len(u2_players)}")

# ============================================================
# 4. REMOVE AGENT - remove one of User 1's agents
# ============================================================
section("4. REMOVE AGENT")

# Get User 1's 3rd agent's room_player_id
r = requests.get(f"{BASE}/rooms/{room_id}", headers=h1)
players = r.json().get("room", {}).get("players", [])
u1_3rd = [p for p in players if p.get("agent_name") == "U1-Agent3"]
test("Found U1-Agent3 in room", len(u1_3rd) == 1)
rp_id_to_remove = u1_3rd[0]["room_player_id"] if u1_3rd else None

if rp_id_to_remove:
    r = requests.post(f"{BASE}/rooms/{room_id}/remove-agent/{rp_id_to_remove}", headers=h1)
    test("Remove U1-Agent3", r.status_code == 200, f"got {r.status_code}: {r.json()}")

# Verify 4 players
r = requests.get(f"{BASE}/rooms/{room_id}", headers=h1)
players = r.json().get("room", {}).get("players", [])
test("Room has 4 players after removal", len(players) == 4, f"got {len(players)}")
agent3_gone = not any(p.get("agent_name") == "U1-Agent3" for p in players)
test("U1-Agent3 no longer in room", agent3_gone)

# ============================================================
# 5. READY + START - all ready, start game
# ============================================================
section("5. READY & START")

# User 2 readies all their agents (single call toggles all)
r = requests.post(f"{BASE}/rooms/{room_id}/ready", headers=h2)
test("User 2 ready all", r.status_code == 200, f"got {r.status_code}: {r.json()}")

# Verify all User 2's agents are ready
r = requests.get(f"{BASE}/rooms/{room_id}", headers=h1)
players = r.json().get("room", {}).get("players", [])
u2_all_ready = all(p["is_ready"] for p in players if p["user_id"] == users[1]["user"]["id"])
test("User 2 all agents ready", u2_all_ready)

# Owner (User 1) starts — owner's agents are implicitly ready
r = requests.post(f"{BASE}/rooms/{room_id}/start", headers=h1)
data = r.json()
test("Start game", r.status_code == 200, f"got {r.status_code}: {data}")
game_id = data.get("game_id")
test("Has game_id", game_id is not None)

# ============================================================
# 6. WAIT FOR GAME TO FINISH
# ============================================================
section("6. GAME EXECUTION")

if game_id:
    print("  ⏳ Waiting for game to complete...")
    max_wait = 60
    elapsed = 0
    game_status = None
    while elapsed < max_wait:
        time.sleep(3)
        elapsed += 3
        r = requests.get(f"{BASE}/games/{game_id}", headers=h1)
        if r.status_code == 200:
            game = r.json().get("game", {})
            game_status = game.get("status")
            print(f"    ... {elapsed}s - status: {game_status}")
            if game_status == "FINISHED":
                break
    
    test("Game completed", game_status == "FINISHED", f"status: {game_status}")

# ============================================================
# 7. VERIFY GAME DETAILS - check 4 players with mixed ownership
# ============================================================
section("7. GAME DETAILS")

if game_id:
    r = requests.get(f"{BASE}/games/{game_id}", headers=h1)
    data = r.json()
    test("Game detail: status 200", r.status_code == 200)
    
    game = data.get("game", {})
    game_players = game.get("players", [])
    test("Game has 4 players", len(game_players) == 4, f"got {len(game_players)}")
    
    # Check roles assigned
    roles = [p.get("role") for p in game_players]
    test("Has SPY", "SPY" in roles, f"roles: {roles}")
    test("Has CIVILIAN", "CIVILIAN" in roles, f"roles: {roles}")
    test("Has result", game.get("result") is not None, f"result: {game.get('result')}")
    
    # Check mixed user_ids
    user_ids = set(p.get("user_id") for p in game_players)
    test("Players from 2 different users", len(user_ids) == 2, f"user_ids: {user_ids}")
    
    # Replay
    r = requests.get(f"{BASE}/games/{game_id}/replay", headers=h1)
    replay = r.json().get("replay", {})
    rounds = replay.get("rounds", [])
    test("Replay has rounds", len(rounds) > 0, f"got {len(rounds)}")

# ============================================================
# 8. HISTORY - both users see game in their history
# ============================================================
section("8. HISTORY FOR BOTH USERS")

for ui, u in enumerate(users):
    headers = {"Authorization": f"Bearer {u['token']}"}
    r = requests.get(f"{BASE}/history", headers=headers)
    data = r.json()
    games = data.get("games", [])
    test(f"User {ui+1} has history entries", len(games) > 0, f"got {len(games)}")
    
    r = requests.get(f"{BASE}/history/stats", headers=headers)
    stats = r.json().get("stats", {})
    test(f"User {ui+1} total_games >= 1", stats.get("total_games", 0) >= 1)

# ============================================================
# SUMMARY
# ============================================================
print(f"\n{'='*60}")
print(f"  RESULTS: {PASS} passed, {FAIL} failed, {PASS+FAIL} total")
print(f"{'='*60}")

if FAIL > 0:
    sys.exit(1)
else:
    print("\n  🎉 All multi-agent tests passed!")
    sys.exit(0)
