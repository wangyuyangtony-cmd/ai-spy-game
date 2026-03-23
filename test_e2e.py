import requests, json, time

BASE = "http://localhost:3001/api"

def reg(username, nickname):
    r = requests.post(f"{BASE}/auth/register", json={"username": username, "password": "test1234", "nickname": nickname})
    data = r.json()
    return data["token"], data["user"]["id"]

def auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

def create_agent(token, name, model, prompt, temp=0.7):
    r = requests.post(f"{BASE}/agents", headers=auth(token), 
        json={"name":name,"model":model,"system_prompt":prompt,"temperature":temp})
    data = r.json()
    return data.get("agent", data)

print("=" * 60)
print("AI 谁是卧底 - 端到端测试")
print("=" * 60)

print("\n[1] Register 4 players")
t1, u1 = reg("player1", "玩家一号")
t2, u2 = reg("player2", "玩家二号")
t3, u3 = reg("player3", "玩家三号")
t4, u4 = reg("player4", "玩家四号")
print(f"  ✓ 4 players registered")

print("\n[2] Create agents")
a1 = create_agent(t1, "分析大师", "gpt-4o", "你是一个善于分析的玩家", 0.7)
a2 = create_agent(t2, "狡猾狐狸", "gpt-4o-mini", "你是一个擅长伪装的玩家", 0.8)
a3 = create_agent(t3, "保守派", "deepseek-v3", "你是一个谨慎的玩家", 0.5)
a4 = create_agent(t4, "激进派", "gpt-4o", "你是一个积极主动的玩家", 1.0)
print(f"  ✓ {a1['name']}, {a2['name']}, {a3['name']}, {a4['name']}")

print("\n[3] Create room (owner with agent)")
room_resp = requests.post(f"{BASE}/rooms", headers=auth(t1), json={
    "room_name": "测试对战房", "max_players": 4, "spy_count": 1, 
    "has_blank": False, "max_rounds": 5, "agent_id": a1["id"]
}).json()
room = room_resp.get("room", room_resp)
rid = room["id"]
print(f"  ✓ Room: {room.get('room_name','?')} ({rid[:8]}..)")

print("\n[4] Join room (Players 2-4)")
for i, (t, a) in enumerate([(t2, a2), (t3, a3), (t4, a4)], 2):
    r = requests.post(f"{BASE}/rooms/{rid}/join", headers=auth(t), json={"agent_id": a["id"]})
    print(f"  Player{i}: {r.status_code} {'✓' if r.status_code == 200 else r.text[:80]}")

print("\n[5] Ready up (all 4)")
for i, t in enumerate([t1, t2, t3, t4], 1):
    r = requests.post(f"{BASE}/rooms/{rid}/ready", headers=auth(t))
    print(f"  Player{i}: {r.status_code} {'✓' if r.status_code == 200 else r.text[:80]}")

print("\n[6] Room status check")
ri = requests.get(f"{BASE}/rooms/{rid}", headers=auth(t1)).json()
ri = ri.get("room", ri)
players_in = ri.get("players", [])
print(f"  Status: {ri.get('status')}, Players: {len(players_in)}")
for p in players_in:
    print(f"    {p.get('nickname','?')} | {p.get('agent_name','?')} | Ready: {p.get('is_ready')}")

all_ready = all(p.get("is_ready") for p in players_in)
print(f"  All ready: {all_ready}")

print("\n[7] Start game")
start_resp = requests.post(f"{BASE}/rooms/{rid}/start", headers=auth(t1))
print(f"  Status: {start_resp.status_code}")
start_data = start_resp.json()
print(f"  Response: {json.dumps(start_data, ensure_ascii=False)[:300]}")

game_id = start_data.get("game_id") or start_data.get("id") or start_data.get("game",{}).get("id")
print(f"  Game ID: {game_id}")

if game_id:
    print("\n[8] Waiting for game to complete...")
    last_status = ""
    for i in range(60):
        time.sleep(2)
        gr = requests.get(f"{BASE}/games/{game_id}", headers=auth(t1))
        if gr.status_code == 200:
            gd = gr.json()
            game_data = gd.get("game", gd)
            status = game_data.get("status", "?")
            if status != last_status:
                last_status = status
                print(f"  [{i*2:3d}s] → {status}")
            if status in ("FINISHED", "END", "ended", "ENDED"):
                result = game_data.get("result", "?")
                print(f"\n  🏆 Game finished! Result: {result}")
                for gp in game_data.get("players", []):
                    alive_mark = "✓" if gp.get("is_alive") else "✗"
                    print(f"    [{alive_mark}] Seat {gp.get('seat_index')}: {gp.get('nickname','?')} | {gp.get('role')} | Word: {gp.get('word')}")
                break
    else:
        print(f"  ⚠ Timeout after 120s, last status: {last_status}")

    print("\n[9] Replay data")
    rp = requests.get(f"{BASE}/games/{game_id}/replay", headers=auth(t1))
    if rp.status_code == 200:
        rpd = rp.json()
        rounds = rpd.get("rounds", [])
        if isinstance(rounds, list):
            print(f"  ✓ {len(rounds)} round(s)")
            for rd in rounds:
                sp = rd.get("speeches", [])
                if isinstance(sp, str): sp = json.loads(sp)
                vt = rd.get("votes", [])
                if isinstance(vt, str): vt = json.loads(vt)
                print(f"  Round {rd.get('round_number')}: {len(sp)} speeches, {len(vt)} votes, eliminated: {rd.get('eliminated_player_id','none')}")
                for s in sp[:2]:
                    print(f"    💬 \"{str(s.get('content',''))[:60]}\"")

    print("\n[10] History")
    h = requests.get(f"{BASE}/history", headers=auth(t1)).json()
    games = h.get("games", h) if isinstance(h, dict) else h
    if isinstance(games, list):
        print(f"  ✓ {len(games)} game(s) in history")

    print("\n[11] Stats")
    s = requests.get(f"{BASE}/history/stats", headers=auth(t1)).json()
    stats = s.get("stats", s)
    print(f"  Total: {stats.get('total_games',0)} | Wins: {stats.get('total_wins',0)} | Rate: {stats.get('win_rate',0)}")
else:
    print("\n⚠ No game_id returned, skipping game tests")

print("\n" + "=" * 60)
print("✅ 端到端测试完成!")
print("=" * 60)
