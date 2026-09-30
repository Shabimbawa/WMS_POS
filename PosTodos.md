ToDos and things to take note of for the POS-side of things

1. Known UI issue
    - `src/pages/POS/orderslip/create-orderslip-page.tsx` / `src/pages/POS/orderslip/edit-orderslip-page.tsx` — the "Order slip created/updated" success toast likely never shows, because the page that renders it (`message.useMessage()` holder) unmounts on `navigate`. Same issue exists on the WMS `create-shipment-page.tsx`.
2. Hosted database needs the new migration
    - `server/drizzle/0003_cashiers-daily-slip-numbers.sql` adds the `cashier` table, makes `order_slip.cashier_id` required, and switches slip numbers to per-day. Run `npm run db:migrate` against the hosted DB when deploying. It will fail if that DB already has order slips (they'd have no cashier) — clear them first or assign them one.
3. Partial payments have no amount
    - The summary's "Amount paid" only counts fully paid slips, because a partial slip doesn't record how much was paid. If partial amounts matter, the slip needs an amount-paid field (or a payments table).
4. Possible future additions for the summary page (not needed yet)
    - Printing a day's summary.
    - Exporting it (e.g. to a spreadsheet).
5. Confirm the seeded selling prices (`server/src/scripts/seed-reference.ts`)
    - 5kg and 10kg prices on the wall board are about the same as the 50kg price (e.g. Ganador 50kg ₱2,620, 10kg ₱2,710, 5kg ₱2,720), even in the printed column. They look like prices per bundle (10 × 5kg or 5 × 10kg), not per sack. The POS charges per sack, so as seeded, one 5kg sack costs about as much as a 50kg one. Decide whether 5kg/10kg are sold per sack or per bundle, then fix the prices (or the unit).
    - Ivory (Red) 50kg / 25kg / 5kg (₱2,470 / ₱1,275 / ₱2,500) are handwritten corrections that are hard to read.
    - L-King and Palawan 25kg (₱1,185) are well under half their 50kg price (₱2,770), unlike every other brand. Worth double-checking.
    - On the board but not in the seed: Royal Liberty (₱2,400) and Alpha Omega (White) (₱2,450), both without a sack size; Oliver, Master Chef, Japonica Rice (no price).
6. Slip number gaps
    - Moving a slip to another date gives it the next number on the new day and leaves a gap on the old day (e.g. #1, #3). The other slips on the old day keep their numbers, so printed slips stay valid. Revisit if gaps are a problem.


<---FOLLOW UP NOTES FOR THE SUMMARY PAGE AND EXISTING PAGES---> (implemented; see open items above for what's left)
1. Each order slip needs to be assigned to a particular cashier.
    - Since this is the case, we need to add an assignment dropdown in the add/edit order slip pages.
    - This means the order-slip table will also have a new FK to be assigned per cashier.
    - Currently still lacking a cashier table, still discussing how to go about implementing this table.
    - Once cashiers are implemented, need to allow searching via this as well.
2. The summary page should be a summary for all the order slips per cashier per day
    - This can be implemented in like a multi table view thing or something
3. Per day, every order slip resets to start counting from 1 to x, 
    - PK should be something different ofc.

<---CLARIFYING QUESTIONS (answer under each "A:")--->

Current state, for context:
- The PK is already separate: `order_slip.id` is a UUID, and `slip_number` is its own column. But `slip_number` is currently one global identity counter (unique across the whole table), so a daily reset means changing how it's generated.
- There's no cashier concept yet. Users are `app_user` + a `profile` with one role: `warehouse_admin` or `pos_admin`.

### Cashiers (follow-up note 1)

1. Is a cashier someone who logs in? (a) a login account with a new role like `cashier`, or (b) plain records (name, active flag) with no login? With (a), slips could default to whoever is logged in; with (b), a `pos_admin` always picks from a list.
    - A: A cashier isn't someone who logs in. Just a plain records table containing a name and flag whether active or not.
2. Who assigns the cashier, and when? Is it chosen when the slip is created? Is it required, or can a slip be unassigned for a while?
    - A: The cashier is assigned when the slip is created and should be required.
3. Can the cashier be changed when editing? Paid slips are locked from editing today. Should reassigning a cashier be the one exception, or stay locked too?
    - A: The cashier can be changed when editing, however we can keep paid slips locked for now. 
4. Existing slips were created before cashiers existed. Should the new column be optional, or should they all be given a placeholder/default cashier?
    - A: This is a fresh system so there are no old records. The new column should be required.
5. When a cashier leaves, I'd assume they're deactivated (hidden from the dropdown but kept on old slips) rather than deleted. Is that right?
    - A: Yes this is correct, no hard deletes.
6. Searching by cashier: a separate "Cashier" dropdown filter next to the date range, or part of the existing text search (which matches customer name and slip number)?
    - A: It can be part of the existing text search for now.

### Summary page (follow-up note 2)

7. What figures go in each cashier's day? e.g. number of slips, total amount, amount split by Paid/Partial/Unpaid, sacks sold per product, or the full list of that cashier's slips for the day?
    - A: Number of slips, total sacks per product, total amount paid, total number of paid/partial/unpaid
8. Which date decides the day: the slip's `date` field (editable) or when the slip was actually created?
    - A: The slips `date` field
9. One day at a time with a date picker, or a date range (e.g. a week, day by day)?
    - A: I think it can be a date range, but the default display should be for a single day (current date)
10. Layout: one table per cashier, or one table with a row per cashier that expands to show their slips (like the Shipments page does with containers)?
    - A: I think it can be several cards, each card indicating a particular cashier, and then on clicking a specific card, it brings up the detailed list of all order slips for that cashier for the day.
11. Is it for `pos_admin` only? Does it need printing or exporting?
    - A: This is for pos_admin only, currently no need for printing or exporting, however make a note for possible future implementations.

### Daily slip numbering (follow-up note 3)

12. One counter per day, or one per cashier per day? With one per day, Cashier A's slips might be 1 and 3 while Cashier B gets 2. With one per cashier per day, each starts at 1.
    - A: One counter per day.
13. Which day does the numbering follow: the slip's `date` or when it was created? If a slip's `date` is edited to another day, should it be renumbered for that day or keep its original number?
    - A: It follows a slip's `date`. If ever the field is edited, it should be renumbered for that specific day.
14. Once numbers repeat, "#3" is ambiguous on its own. Show it as e.g. "Sep 19 · #3", or does the plain number alone match the paper slips?
    - A: I think your suggestion would be good "Sep 19 · #3"
15. Time zone: I'd assume "a day" means Philippine time (Asia/Manila). Is that right?
    - A: Yes, day means Philippine time.