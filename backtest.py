import requests
import pandas as pd
import numpy as np
from datetime import datetime, timezone
import time

EPOCH_NEW = datetime(2000, 1, 6, 18, 14, 0, tzinfo=timezone.utc)
SYNODIC   = 29.53059

def get_phase(date):
    elapsed = (date - EPOCH_NEW).total_seconds() / 86400
    pct = (elapsed % SYNODIC) / SYNODIC % 1
    if pct < 0.125: return 'new'
    if pct < 0.500: return 'wax'
    if pct < 0.625: return 'full'
    return                 'wan'

print("Fetching SOL price history...")
url    = "https://api.coingecko.com/api/v3/coins/solana/market_chart"
params = {"vs_currency": "usd", "days": "365", "interval": "daily"}
r      = requests.get(url, params=params)
resp   = r.json()
if "prices" not in resp:
    print("Rate limited — waiting 60s..."); time.sleep(60)
    resp = requests.get(url, params=params).json()

df = pd.DataFrame(resp["prices"], columns=["ts", "price"])
df["date"]  = pd.to_datetime(df["ts"], unit="ms", utc=True)
df["phase"] = df["date"].map(get_phase)
df = df.drop(columns=["ts"]).reset_index(drop=True)

print(f"Data: {df['date'].min().date()} → {df['date'].max().date()} ({len(df)} days)\n")

DAILY_BUDGET = 10.0
JLP_APY      = 0.15
JUPUSD_APY   = 0.056
DAILY_JLP    = JLP_APY   / 365
DAILY_JUPUSD = JUPUSD_APY / 365

ms_sol = ms_spent = ms_yield = ms_buy_spent = 0.0
dca_sol = dca_spent = 0.0

new_days = len(df[df["phase"] == "new"])
wax_days = len(df[df["phase"] == "wax"])
buy_days = new_days + (wax_days * 0.5)

for _, row in df.iterrows():
    price = row["price"]
    phase = row["phase"]

    # Regular DCA — buys every single day, same daily budget
    dca_sol   += DAILY_BUDGET / price
    dca_spent += DAILY_BUDGET

    # MoonSurfer — phase-weighted
    if phase == 'new':
        buy           = DAILY_BUDGET * 1.0
        ms_sol       += buy / price
        ms_spent     += DAILY_BUDGET
        ms_buy_spent += buy
    elif phase == 'wax':
        buy           = DAILY_BUDGET * 0.5
        ms_sol       += buy / price
        ms_spent     += DAILY_BUDGET
        ms_buy_spent += buy
        ms_yield     += (DAILY_BUDGET * 0.5) * DAILY_JLP
    elif phase == 'full':
        ms_yield     += DAILY_BUDGET * DAILY_JUPUSD
        ms_spent     += DAILY_BUDGET
    elif phase == 'wan':
        ms_yield     += DAILY_BUDGET * DAILY_JLP
        ms_spent     += DAILY_BUDGET

final_price   = df["price"].iloc[-1]
ms_sol_value  = ms_sol  * final_price
dca_sol_value = dca_sol * final_price
ms_total      = ms_sol_value + ms_yield
dca_total     = dca_sol_value

ms_avg_price  = ms_buy_spent / ms_sol  if ms_sol  > 0 else 0
dca_avg_price = dca_spent / dca_sol if dca_sol > 0 else 0

print("═" * 50)
print("MOONSURFER BACKTEST RESULTS")
print("═" * 50)
print(f"\nSOL final price:       ${final_price:,.2f}")

print("\n── MoonSurfer Lunar DCA ──────────────────────")
print(f"  SOL accumulated:   {ms_sol:.4f} SOL")
print(f"  SOL value:         ${ms_sol_value:,.2f}")
print(f"  Yield earned:      ${ms_yield:,.2f}")
print(f"  Total value:       ${ms_total:,.2f}")
print(f"  Avg buy price:     ${ms_avg_price:.2f}")

print("\n── Regular DCA (same buy days only) ──────────")
print(f"  SOL accumulated:   {dca_sol:.4f} SOL")
print(f"  SOL value:         ${dca_sol_value:,.2f}")
print(f"  Avg buy price:     ${dca_avg_price:.2f}")

print("\n── Key metric ────────────────────────────────")
print(f"  Price advantage:   ${dca_avg_price - ms_avg_price:+.2f} per SOL")
print(f"  Yield bonus:       ${ms_yield:,.2f}")
print(f"  Extra SOL:         {ms_sol - dca_sol:+.4f} SOL")
print(f"\n  {'✓ Thesis HOLDS' if ms_avg_price < dca_avg_price else '✗ Thesis FAILS'}")

print("\n── Avg SOL price per phase ───────────────────")
print(df.groupby("phase")["price"].mean().round(2).to_string())