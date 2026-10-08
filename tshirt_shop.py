#!/usr/bin/env python3
"""
T-Shirt Printing Shop Manager
-----------------------------
A simple command-line tool to:
  1. Quote a price (with bulk discounts)
  2. Create customer orders
  3. Record payments / deposits
  4. Track order status (pending -> printing -> ready -> collected)
  5. List orders and see a sales summary

Data is stored in a local SQLite file (tshirt_shop.db), so nothing is lost
when you close the program. Run with:  python tshirt_shop.py
"""

import sqlite3
from datetime import date

DB_FILE = "tshirt_shop.db"
CURRENCY = "KES"

# ---- EDIT THESE PRICES TO MATCH YOUR SHOP -------------------------------
SHIRT_PRICES = {"round neck": 350, "polo": 550, "hoodie": 1200}   # blank garment cost/price
PRINT_PRICES = {"small": 150, "medium": 250, "large": 400}         # per print placement
EXTRA_COLOR_FEE = 50                                               # per extra colour, per placement
BULK_DISCOUNTS = [(100, 0.20), (50, 0.15), (20, 0.10), (10, 0.05)] # (min qty, discount)
STATUSES = ["pending", "printing", "ready", "collected"]
# -------------------------------------------------------------------------


# ============================ DATABASE ===================================
def get_db():
	conn = sqlite3.connect(DB_FILE)
	conn.row_factory = sqlite3.Row
	conn.execute(
		"""CREATE TABLE IF NOT EXISTS orders (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			customer TEXT NOT NULL,
			phone TEXT,
			shirt_type TEXT NOT NULL,
			qty INTEGER NOT NULL,
			print_size TEXT NOT NULL,
			placements INTEGER NOT NULL,
			colors INTEGER NOT NULL,
			total INTEGER NOT NULL,
			paid INTEGER NOT NULL DEFAULT 0,
			status TEXT NOT NULL DEFAULT 'pending',
			created TEXT NOT NULL,
			due_date TEXT,
			notes TEXT
		)"""
	)
	return conn


# ============================ PRICING ====================================
def calculate_quote(shirt_type, qty, print_size, placements, colors):
	"""Return a dict with unit price, discount and total."""
	unit = SHIRT_PRICES[shirt_type]
	unit += PRINT_PRICES[print_size] * placements
	unit += EXTRA_COLOR_FEE * (colors - 1) * placements

	discount = 0.0
	for min_qty, rate in BULK_DISCOUNTS:  # sorted highest first
		if qty >= min_qty:
			discount = rate
			break

	subtotal = unit * qty
	total = round(subtotal * (1 - discount))
	return {"unit": unit, "subtotal": subtotal, "discount": discount, "total": total}


def show_quote(q, qty):
	print(f"\n  Unit price : {CURRENCY} {q['unit']:,}")
	print(f"  Quantity   : {qty}")
	print(f"  Subtotal   : {CURRENCY} {q['subtotal']:,}")
	if q["discount"]:
		print(f"  Discount   : {int(q['discount'] * 100)}% bulk discount")
	print(f"  TOTAL      : {CURRENCY} {q['total']:,}\n")


# ============================ INPUT HELPERS ==============================
def ask_int(prompt, minimum=1):
	while True:
		try:
			value = int(input(prompt).strip())
			if value >= minimum:
				return value
		except ValueError:
			pass
		print(f"  Please enter a whole number (min {minimum}).")


def ask_choice(prompt, options):
	options = list(options)
	print(prompt)
	for i, opt in enumerate(options, 1):
		print(f"  {i}. {opt}")
	while True:
		try:
			idx = int(input("  Choose: ").strip())
			if 1 <= idx <= len(options):
				return options[idx - 1]
		except ValueError:
			pass
		print("  Invalid choice, try again.")


def ask_job_details():
	shirt = ask_choice("Shirt type:", SHIRT_PRICES)
	qty = ask_int("Quantity: ")
	size = ask_choice("Print size:", PRINT_PRICES)
	placements = ask_int("Print placements (e.g. 1 = front only, 2 = front+back): ")
	colors = ask_int("Number of colours in the design: ")
	return shirt, qty, size, placements, colors


# ============================ ACTIONS ====================================
def quote_only():
	shirt, qty, size, placements, colors = ask_job_details()
	show_quote(calculate_quote(shirt, qty, size, placements, colors), qty)


def new_order(conn):
	customer = input("Customer name: ").strip()
	phone = input("Phone number: ").strip()
	shirt, qty, size, placements, colors = ask_job_details()
	q = calculate_quote(shirt, qty, size, placements, colors)
	show_quote(q, qty)

	due = input("Due date (YYYY-MM-DD, optional): ").strip() or None
	notes = input("Notes (optional): ").strip() or None
	deposit = ask_int(f"Deposit paid now ({CURRENCY}, 0 if none): ", minimum=0)
	deposit = min(deposit, q["total"])

	cur = conn.execute(
		"""INSERT INTO orders (customer, phone, shirt_type, qty, print_size,
		   placements, colors, total, paid, created, due_date, notes)
		   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
		(customer, phone, shirt, qty, size, placements, colors,
		 q["total"], deposit, date.today().isoformat(), due, notes),
	)
	conn.commit()
	print(f"\n  Order #{cur.lastrowid} saved. Balance: {CURRENCY} {q['total'] - deposit:,}\n")


def find_order(conn):
	order_id = ask_int("Order number: ")
	row = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
	if not row:
		print("  Order not found.\n")
	return row


def record_payment(conn):
	row = find_order(conn)
	if not row:
		return
	balance = row["total"] - row["paid"]
	print(f"  {row['customer']} owes {CURRENCY} {balance:,}")
	if balance == 0:
		print("  Already fully paid.\n")
		return
	amount = min(ask_int(f"Amount received ({CURRENCY}): "), balance)
	conn.execute("UPDATE orders SET paid = paid + ? WHERE id = ?", (amount, row["id"]))
	conn.commit()
	print(f"  Recorded. New balance: {CURRENCY} {balance - amount:,}\n")


def update_status(conn):
	row = find_order(conn)
	if not row:
		return
	print(f"  Current status: {row['status']}")
	new_status = ask_choice("New status:", STATUSES)
	if new_status == "collected" and row["paid"] < row["total"]:
		print(f"  Warning: balance of {CURRENCY} {row['total'] - row['paid']:,} still unpaid!")
	conn.execute("UPDATE orders SET status = ? WHERE id = ?", (new_status, row["id"]))
	conn.commit()
	print("  Status updated.\n")


def list_orders(conn):
	choice = ask_choice("Show which orders?", ["all"] + STATUSES + ["unpaid"])
	if choice == "all":
		rows = conn.execute("SELECT * FROM orders ORDER BY id DESC").fetchall()
	elif choice == "unpaid":
		rows = conn.execute("SELECT * FROM orders WHERE paid < total ORDER BY id DESC").fetchall()
	else:
		rows = conn.execute("SELECT * FROM orders WHERE status = ? ORDER BY id DESC", (choice,)).fetchall()

	if not rows:
		print("  No orders found.\n")
		return

	print(f"\n  {'#':<4}{'Customer':<18}{'Item':<12}{'Qty':<5}{'Total':<10}{'Paid':<10}{'Status':<10}{'Due'}")
	print("  " + "-" * 82)
	for r in rows:
		print(f"  {r['id']:<4}{r['customer'][:16]:<18}{r['shirt_type']:<12}{r['qty']:<5}"
			  f"{r['total']:<10,}{r['paid']:<10,}{r['status']:<10}{r['due_date'] or '-'}")
	print()


def sales_summary(conn):
	row = conn.execute(
		"SELECT COUNT(*) n, COALESCE(SUM(total),0) t, COALESCE(SUM(paid),0) p FROM orders"
	).fetchone()
	today = conn.execute(
		"SELECT COUNT(*) n, COALESCE(SUM(total),0) t FROM orders WHERE created = ?",
		(date.today().isoformat(),),
	).fetchone()
	print("\n  ===== SALES SUMMARY =====")
	print(f"  Orders today     : {today['n']} ({CURRENCY} {today['t']:,})")
	print(f"  Total orders     : {row['n']}")
	print(f"  Total billed     : {CURRENCY} {row['t']:,}")
	print(f"  Total collected  : {CURRENCY} {row['p']:,}")
	print(f"  Outstanding      : {CURRENCY} {row['t'] - row['p']:,}\n")


# ============================ MAIN MENU ==================================
def main():
	conn = get_db()
	actions = {
		"1": ("Get a price quote", lambda: quote_only()),
		"2": ("New order", lambda: new_order(conn)),
		"3": ("Record a payment", lambda: record_payment(conn)),
		"4": ("Update order status", lambda: update_status(conn)),
		"5": ("List orders", lambda: list_orders(conn)),
		"6": ("Sales summary", lambda: sales_summary(conn)),
	}
	while True:
		print("=== T-SHIRT PRINTING SHOP ===")
		for key, (label, _) in actions.items():
			print(f"  {key}. {label}")
		print("  0. Exit")
		choice = input("Select: ").strip()
		if choice == "0":
			print("Goodbye!")
			break
		if choice in actions:
			actions[choice][1]()
		else:
			print("  Invalid option.\n")


if __name__ == "__main__":
	main()
