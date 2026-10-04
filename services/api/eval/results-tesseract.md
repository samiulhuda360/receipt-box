# Receipt reading: tesseract

30 synthetic NZ receipts (`eval/receipts`, made by `npm run eval:make`). Median 0.2 s per receipt.

| Layout | Receipts | Vendor | Date | Total | GST | Total and GST both right | All four right |
|---|---|---|---|---|---|---|---|
| thermal | 10 | 100% | 100% | 90% | 80% | 80% | 80% |
| cafe | 10 | 90% | 100% | 100% | 100% | 100% | 90% |
| invoice | 10 | 80% | 100% | 100% | 100% | 100% | 80% |
| all | 30 | 90% | 100% | 97% | 93% | 93% | 83% |

## Misses

| File | Expected | Read (vendor, date, total, GST) |
|---|---|---|
| 03.png | Tūī Stationery, 2026-07-16, 132.28, 17.25 | Tai Stationery | 2026-07-16 | 132.28 | 17.25 |
| 16.jpg | Ruru Tech Supplies, 2026-05-23, 177.59, 23.16 | Ruru Tech Supplies | 2026-05-23 | 17.59 | - |
| 19.png | Fantail Printing, 2026-07-28, 102.38, 13.35 | Fantail Printing | 2026-07-28 | 102.38 | - |
| 23.png | Tūī Stationery, 2026-08-28, 187.82, 24.50 | Tail Stationery | 2026-08-28 | 187.82 | 24.50 |
| 24.jpg | Pōhutukawa Café, 2026-06-26, 88.18, 11.50 | P6hutukawa Caf | 2026-06-26 | 88.18 | 11.50 |
