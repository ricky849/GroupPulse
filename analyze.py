import json
import pandas as pd
from datetime import datetime, timedelta
from collections import defaultdict, Counter
from tabulate import tabulate   


print("\nLoading messages.jsonl...")
records = []
with open("messages.jsonl", "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            records.append(json.loads(line))
        except Exception:
            continue

if not records:
    print("No records found.")
    exit()

df = pd.DataFrame(records)

df['datetime'] = pd.to_datetime(df['timestamp'])
df = df.sort_values('datetime').reset_index(drop=True)

df['sender'] = df['sender'].fillna('Unknown')

total_msgs = len(df)
time_span = df['datetime'].max() - df['datetime'].min()
hours = max(time_span.total_seconds() / 3600, 0.1)

print(f"Loaded {total_msgs:,} messages across {hours:.1f} hours.")
print(f"From: {df['datetime'].min().strftime('%Y-%m-%d %H:%M')} UTC")
print(f"To: {df['datetime'].max().strftime('%Y-%m-%d %H:%M')} UTC")


user_stats = defaultdict(lambda: {
    'total_msgs': 0,
    'text_msgs': 0,
    'media_msgs': 0,
    'stickers': 0,
    'total_words': 0,
    'chars': 0,
    'silence_breaks': 0,
    'replies_sent': 0
})

SILENCE_THRESHOLD = timedelta(minutes=90)

prev_time = None
for idx, row in df.iterrows():
    sender = row['sender']
    curr_time = row['datetime']
    body = str(row['body']) if pd.notnull(row['body']) else ""
    msg_type = str(row['type'])
    has_media = bool(row['hasMedia'])
    has_quote = bool(row.get('hasQuotedMsg', False))

    stats = user_stats[sender]
    stats['total_msgs'] += 1

    if has_quote:
        stats['replies_sent'] += 1

    if msg_type == 'sticker':
        stats['stickers'] += 1
    elif has_media or msg_type in ['image', 'video', 'ptt', 'audio', 'document']:
        stats['media_msgs'] += 1
    else:
        stats['text_msgs'] += 1
        words = len(body.split())
        stats['total_words'] += words
        stats['chars'] += len(body)

    if prev_time and (curr_time - prev_time) >= SILENCE_THRESHOLD:
        stats['silence_breaks'] += 1

    prev_time = curr_time


leaderboard = []

for sender, stats in user_stats.items():
    if stats['total_msgs'] < 2:
        continue

    share_pct = (stats['total_msgs'] / total_msgs) * 100
    avg_words = (stats['total_words'] / stats['text_msgs']) if stats['text_msgs'] > 0 else 0
    reply_rate = (stats['replies_sent'] / stats['total_msgs']) * 100

    volume_score = min(stats['total_msgs'] / (total_msgs / len(user_stats)), 3.0) * 33.3
    initiation_score = stats['silence_breaks'] * 15.0
    engagement_score = (reply_rate / 100) * 33.3

    power_score = round(volume_score + initiation_score + engagement_score, 1)

    leaderboard.append({
        'Rank': 0,
        'Member': sender,
        'Pulse Score': power_score,
        'Msgs': stats['total_msgs'],
        'Share %': f"{share_pct:.1f}%",
        'Avg Words': f"{avg_words:.1f}",
        'Media': stats['media_msgs'],
        'Stickers': stats['stickers'],
        'Chat Revivals': stats['silence_breaks']
    })

leaderboard = sorted(leaderboard, key=lambda x: x['Pulse Score'], reverse=True)
for i, entry in enumerate(leaderboard, 1):
    entry['Rank'] = f"#{i}"

df['hour'] = df['datetime'].dt.hour
hourly_counts = df['hour'].value_counts().sort_index()
peak_hour = hourly_counts.idxmax()


print("----GroupPulse: Day 1 Report----")

print(tabulate(leaderboard, headers='keys', tablefmt='fancy_grid'))
print("\n Group Dynamics:")
print(f"Peak Hour: {peak_hour:02d}:00 - {peak_hour+1:02d}:00 UTC ({hourly_counts.max()} msgs)")
print(f"Chat Engagement Specialist: {max(user_stats.items(), key=lambda x: x[1]['silence_breaks'])[0]}")
print(f"Most Talkative Member (Highest Avg Words): {max(leaderboard, key=lambda x: float(x['Avg Words']))['Member']} ({max(leaderboard, key=lambda x: float(x['Avg Words']))['Avg Words']} words/msg)")
print(f"Media/Meme King: {max(leaderboard, key=lambda x: x['Media'] + x['Stickers'])['Member']}")
print("=" * 80 + "\n")
