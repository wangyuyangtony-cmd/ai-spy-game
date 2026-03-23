#!/usr/bin/env python3
"""
Full end-to-end test for AI Spy Game
Tests: Registration, Login, Agent CRUD, Room lifecycle, Game lifecycle, History, Stats
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

# ============================================================
# 1. AUTH - Register & Login
# ============================================================
section("1. AUTH - Register & Login")

users = []
for i in range(1, 5):
    r = requests.post(f"{BASE}/auth/register", json={
        "username": f"testplayer{i}_{int(time.time())}",
        "password": "password123",
        "nickname": f"Player {i}"
    })
    data = r.json()
    test(f"Register user {i}: status 201", r.status_code == 201, f"got {r.status_code}: {data}")
    if r.status_code == 201:
        test(f"Register user {i}: has token", "token" in data, f"keys: {list(data.keys())}")
        test(f"Register user {i}: has user obj", "user" in data, f"keys: {list(data.keys())}")
        users.append({"token": data.get("token"), "user": data.get("user", {})})
    else:
        users.append(None)

# Login test
if users[0]:
    r = requests.post(f"{BASE}/auth/login", json={
        "username": users[0]["user"].get("username"),
        "password": "password123"
    })
    data = r.json()
    test("Login: status 200", r.status_code == 200, f"got {r.status_code}")
    test("Login: has token", "token" in data)

# GetMe test
if users[0]:
    r = requests.get(f"{BASE}/auth/me", headers={"Authorization": f"Bearer {users[0]['token']}"})
    data = r.json()
    test("GetMe: status 200", r.status_code == 200)
    test("GetMe: has user", "user" in data)
    test("GetMe: user has id", "id" in data.get("user", {}))

# ============================================================
# 2. AGENTS - CRUD operations
# ============================================================
section("2. AGENTS - CRUD")

agent_ids = []
for i, u in enumerate(users):
    if not u:
        agent_ids.append(None)
        continue
    headers = {"Authorization": f"Bearer {u['token']}"}
    
    # Create agent with FLAT snake_case fields (matching backend expectation)
    r = requests.post(f"{BASE}/agents", headers=headers, json={
        "name": f"Agent-{i+1}",
        "model": "gpt-4",
        "system_prompt": f"You are a smart player {i+1} in a spy game.",
        "temperature": 0.7,
        "top_p": 0.9,
        "max_tokens": 300,
        "strategy_template": "Think carefully, be logical.",
        "description": f"Test agent {i+1}",
        "avatar": None
    })
    data = r.json()
    test(f"Create agent {i+1}: status 201", r.status_code == 201, f"got {r.status_code}: {data}")
    if r.status_code == 201:
        agent = data.get("agent", {})
        test(f"Create agent {i+1}: has id", "id" in agent, f"keys: {list(agent.keys())}")
        test(f"Create agent {i+1}: model correct", agent.get("model") == "gpt-4", f"got {agent.get('model')}")
        test(f"Create agent {i+1}: system_prompt correct", agent.get("system_prompt") is not None)
        agent_ids.append(agent.get("id"))
    else:
        agent_ids.append(None)

# List agents
if users[0]:
    headers = {"Authorization": f"Bearer {users[0]['token']}"}
    r = requests.get(f"{BASE}/agents", headers=headers)
    data = r.json()
    test("List agents: status 200", r.status_code == 200)
    test("List agents: has agents array", isinstance(data.get("agents"), list))
    test("List agents: count >= 1", len(data.get("agents", [])) >= 1, f"got {len(data.get('agents', []))}")

# Update agent
if users[0] and agent_ids[0]:
    headers = {"Authorization": f"Bearer {users[0]['token']}"}
    r = requests.put(f"{BASE}/agents/{agent_ids[0]}", headers=headers, json={
        "name": "Updated-Agent-1",
        "model": "gpt-3.5-turbo",
        "temperature": 0.5
    })
    data = r.json()
    test("Update agent: status 200", r.status_code == 200, f"got {r.status_code}: {data}")
    if r.status_code == 200:
        agent = data.get("agent", {})
        test("Update agent: name changed", agent.get("name") == "Updated-Agent-1", f"got {agent.get('name')}")

# Duplicate agent
if users[0] and agent_ids[0]:
    headers = {"Authorization": f"Bearer {users[0]['token']}"}
    r = requests.post(f"{BASE}/agents/{agent_ids[0]}/duplicate", headers=headers)
    data = r.json()
    test("Duplicate agent: status 201", r.status_code == 201, f"got {r.status_code}")

# ============================================================
# 3. ROOMS - Create, Join, Ready
# ============================================================
section("3. ROOMS - Lifecycle")

room_id = None
if users[0] and agent_ids[0]:
    headers = {"Authorization": f"Bearer {users[0]['token']}"}
    r = requests.post(f"{BASE}/rooms", headers=headers, json={
        "room_name": "Test Room",
        "config": {
            "max_players": 6,
            "spy_count": 1,
            "has_blank": False,
            "max_rounds": 3
        },
        "agent_id": agent_ids[0]  # Owner auto-joins
    })
    data = r.json()
    test("Create room: status 201", r.status_code == 201, f"got {r.status_code}: {data}")
    if r.status_code == 201:
        room = data.get("room", {})
        room_id = room.get("id")
        test("Create room: has id", room_id is not None)
        test("Create room: room_name correct", room.get("room_name") == "Test Room", f"got {room.get('room_name')}")

# List rooms
if users[0]:
    headers = {"Authorization": f"Bearer {users[0]['token']}"}
    r = requests.get(f"{BASE}/rooms", headers=headers)
    data = r.json()
    test("List rooms: status 200", r.status_code == 200)
    test("List rooms: has rooms array", isinstance(data.get("rooms"), list))

# Get room detail
if users[0] and room_id:
    headers = {"Authorization": f"Bearer {users[0]['token']}"}
    r = requests.get(f"{BASE}/rooms/{room_id}", headers=headers)
    data = r.json()
    test("Room detail: status 200", r.status_code == 200)
    room = data.get("room", {})
    test("Room detail: has players", "players" in room, f"keys: {list(room.keys())}")
    # Check owner is in players (auto-joined)
    players = room.get("players", [])
    owner_in_players = any(p.get("user_id") == users[0]["user"]["id"] for p in players)
    test("Room detail: owner in players", owner_in_players, f"players: {[p.get('user_id') for p in players]}")

# Other users join
for i in range(1, 4):
    if users[i] and agent_ids[i] and room_id:
        headers = {"Authorization": f"Bearer {users[i]['token']}"}
        r = requests.post(f"{BASE}/rooms/{room_id}/join", headers=headers, json={
            "agent_id": agent_ids[i]
        })
        data = r.json()
        test(f"User {i+1} join room: status 200", r.status_code == 200, f"got {r.status_code}: {data}")

# All players ready
for i in range(4):
    if users[i] and room_id:
        headers = {"Authorization": f"Bearer {users[i]['token']}"}
        r = requests.post(f"{BASE}/rooms/{room_id}/ready", headers=headers)
        data = r.json()
        test(f"User {i+1} ready: status 200", r.status_code == 200, f"got {r.status_code}: {data}")

# Check room status after all ready
if users[0] and room_id:
    headers = {"Authorization": f"Bearer {users[0]['token']}"}
    r = requests.get(f"{BASE}/rooms/{room_id}", headers=headers)
    data = r.json()
    room = data.get("room", {})
    players = room.get("players", [])
    all_ready = all(p.get("is_ready") for p in players)
    test("All players ready", all_ready, f"ready states: {[p.get('is_ready') for p in players]}")
    test("4 players in room", len(players) == 4, f"got {len(players)}")

# ============================================================
# 4. GAME - Start and wait for completion
# ============================================================
section("4. GAME - Start & Play")

game_id = None
if users[0] and room_id:
    headers = {"Authorization": f"Bearer {users[0]['token']}"}
    r = requests.post(f"{BASE}/rooms/{room_id}/start", headers=headers)
    data = r.json()
    test("Start game: status 200", r.status_code == 200, f"got {r.status_code}: {data}")
    game_id = data.get("game_id")
    test("Start game: has game_id", game_id is not None, f"data: {data}")

# Wait for game to complete (Mock LLM should be fast)
if game_id:
    print("\n  ⏳ Waiting for game to complete (Mock LLM mode)...")
    max_wait = 60
    elapsed = 0
    game_status = None
    while elapsed < max_wait:
        time.sleep(3)
        elapsed += 3
        headers = {"Authorization": f"Bearer {users[0]['token']}"}
        r = requests.get(f"{BASE}/games/{game_id}", headers=headers)
        if r.status_code == 200:
            data = r.json()
            game = data.get("game", {})
            game_status = game.get("status")
            print(f"    ... {elapsed}s - status: {game_status}")
            if game_status == "FINISHED":
                break
        else:
            print(f"    ... {elapsed}s - API returned {r.status_code}")
    
    test("Game completed", game_status == "FINISHED", f"status: {game_status}")

# ============================================================
# 5. GAME DETAIL & REPLAY
# ============================================================
section("5. GAME - Detail & Replay")

if game_id and users[0]:
    headers = {"Authorization": f"Bearer {users[0]['token']}"}
    
    # Game detail
    r = requests.get(f"{BASE}/games/{game_id}", headers=headers)
    data = r.json()
    test("Game detail: status 200", r.status_code == 200)
    game = data.get("game", {})
    test("Game detail: has result", game.get("result") is not None, f"result: {game.get('result')}")
    test("Game detail: has players", "players" in data.get("game", {}), f"keys: {list(data.get('game', {}).keys())}")
    current_round = data.get("game", {}).get("current_round")
    test("Game detail: has current_round", current_round is not None, f"current_round: {current_round}")
    
    # Check player roles assigned
    players = game.get("players", [])
    roles = [p.get("role") for p in players]
    test("Game detail: players have roles", all(r is not None for r in roles), f"roles: {roles}")
    test("Game detail: has spy", "SPY" in roles, f"roles: {roles}")
    test("Game detail: has civilians", "CIVILIAN" in roles, f"roles: {roles}")
    
    # Replay
    r = requests.get(f"{BASE}/games/{game_id}/replay", headers=headers)
    data = r.json()
    test("Replay: status 200", r.status_code == 200)
    replay = data.get("replay", {})
    test("Replay: has game", "game" in replay, f"keys: {list(replay.keys())}")
    test("Replay: has players", "players" in replay)
    test("Replay: has rounds", "rounds" in replay)
    rounds = replay.get("rounds", [])
    test("Replay: rounds > 0", len(rounds) > 0, f"got {len(rounds)}")
    if rounds:
        round1 = rounds[0]
        test("Replay: round has speeches", "speeches" in round1, f"keys: {list(round1.keys())}")
        test("Replay: round has votes", "votes" in round1)

# ============================================================
# 6. HISTORY & STATS
# ============================================================
section("6. HISTORY & STATS")

if users[0]:
    headers = {"Authorization": f"Bearer {users[0]['token']}"}
    
    # History list
    r = requests.get(f"{BASE}/history", headers=headers)
    data = r.json()
    test("History: status 200", r.status_code == 200)
    test("History: has games", isinstance(data.get("games"), list))
    test("History: games > 0", len(data.get("games", [])) > 0)
    
    if data.get("games"):
        game_entry = data["games"][0]
        test("History: game has id", "id" in game_entry)
        test("History: game has result", "result" in game_entry)
    
    # Stats
    r = requests.get(f"{BASE}/history/stats", headers=headers)
    data = r.json()
    test("Stats: status 200", r.status_code == 200)
    stats = data.get("stats", {})
    test("Stats: has total_games", "total_games" in stats, f"keys: {list(stats.keys())}")
    test("Stats: total_games >= 1", stats.get("total_games", 0) >= 1, f"got {stats.get('total_games')}")
    test("Stats: has win_rate", "win_rate" in stats)
    test("Stats: has civilian", "civilian" in stats, f"keys: {list(stats.keys())}")
    test("Stats: has spy", "spy" in stats)

# ============================================================
# 7. CLEANUP - Leave room, delete agent
# ============================================================
section("7. EDGE CASES & CLEANUP")

# Try to create room with bad config
if users[0]:
    headers = {"Authorization": f"Bearer {users[0]['token']}"}
    r = requests.post(f"{BASE}/rooms", headers=headers, json={
        "room_name": "",
        "config": {"max_players": 6, "spy_count": 1, "has_blank": False, "max_rounds": 3}
    })
    test("Create room with empty name: rejected", r.status_code == 400, f"got {r.status_code}")

# Auth: register with short username
r = requests.post(f"{BASE}/auth/register", json={
    "username": "ab",
    "password": "password123"
})
test("Register short username: rejected", r.status_code == 400, f"got {r.status_code}")

# Auth: register with short password
r = requests.post(f"{BASE}/auth/register", json={
    "username": "validusername",
    "password": "123"
})
test("Register short password: rejected", r.status_code == 400, f"got {r.status_code}")

# Auth: access protected route without token
r = requests.get(f"{BASE}/agents")
test("No token access: rejected 401", r.status_code == 401, f"got {r.status_code}")

# ============================================================
# SUMMARY
# ============================================================
print(f"\n{'='*60}")
print(f"  RESULTS: {PASS} passed, {FAIL} failed, {PASS+FAIL} total")
print(f"{'='*60}")

if FAIL > 0:
    sys.exit(1)
else:
    print("\n  🎉 All tests passed!")
    sys.exit(0)
