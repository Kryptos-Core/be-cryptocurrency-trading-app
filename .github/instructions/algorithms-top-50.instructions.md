---
name: "algorithms-top-50"
description: "50 thuật toán phổ biến — ý tưởng, độ phức tạp, khi dùng (tham chiếu nhanh khi thiết kế/thi đấu/enterview)"
applyTo: "**/*.{ts,js,tsx,jsx,dart,py,go,java,cs,cpp,c}"
---

# 50 thuật toán phổ biến (tham chiếu)

**Ghi chú**: Độ phức tạp ghi **typical**; worst case có thể khác (ví dụ Quick Sort O(n²)). `n` = kích thước input, `V`/`E` = đỉnh/cạnh đồ thị, `m` = độ dài chuỗi, `W` = trọng số / alphabet.

---

## 1–11 — Tìm kiếm & sắp xếp

### 1. Linear Search (duyệt tuyến tính)
- **Ý tưởng**: lần lượt so sánh từng phần tử với target.
- **Time**: O(n), **Space**: O(1).
- **Khi dùng**: dữ liệu nhỏ, chưa sort, stream không random access.

### 2. Binary Search
- **Ý tưởng**: trên mảng **đã sort**, so sánh giữa và cắt nửa không gian tìm kiếm.
- **Time**: O(log n), **Space**: O(1) lặp hoặc O(log n) đệ quy.
- **Khi dùng**: tìm phần tử, **lower/upper bound**, số lần tối thiểu, rotated array (biến thể).

### 3. Bucket Sort
- **Ý tưởng**: phân phối phần tử vào các **bucket** theo khoảng giá trị, sort từng bucket (thường insertion), ghép lại.
- **Time**: O(n) khi phân bố đều; worst O(n²) bucket lệch; **Space**: O(n + k).
- **Khi dùng**: float trong [0,1), phân bố đều; geo/spatial hashing đơn giản (ý tưởng tương tự).

### 4. Bubble Sort
- **Ý tưởng**: đổi chỗ cặp kề sai thứ tự, lặp nhiều vòng.
- **Time**: O(n²), **Space**: O(1); **stable** nếu cẩn thận.
- **Khi dùng**: chủ yếu giáo dục; production thường dùng sort thư viện.

### 5. Selection Sort
- **Ý tưởng**: mỗi bước chọn min/max đưa về đầu đoạn chưa sort.
- **Time**: O(n²), **Space**: O(1); không stable mặc định.
- **Khi dùng**: số lần ghi nhỏ (embedded); hiếm trên backend.

### 6. Insertion Sort
- **Ý tưởng**: chèn từng phần tử vào đoạn đã sort bên trái.
- **Time**: O(n²) worst, **gần O(n)** khi gần như đã sort, **Space**: O(1); **stable**.
- **Khi dùng**: mảng nhỏ, hybrid trong Timsort/Introsort.

### 7. Merge Sort
- **Ý tưởng**: chia đôi đệ quy, **merge** hai nửa đã sort.
- **Time**: O(n log n), **Space**: O(n) bộ đệm merge; **stable**.
- **Khi dùng**: cần đảm bảo O(n log n) worst, sort linked list, external sort.

### 8. Quick Sort
- **Ý tưởng**: chọn **pivot**, partition nhỏ hơn / lớn hơn pivot, đệ quy hai bên.
- **Time**: trung bình O(n log n), worst O(n²); **Space**: O(log n) stack.
- **Khi dùng**: sort in-place nhanh thực tế; pivot ngẫu nhiên/med-of-three giảm worst case.

### 9. Heap Sort
- **Ý tưởng**: xây **max-heap**, liên tục lấy gốc và heapify.
- **Time**: O(n log n), **Space**: O(1) extra; không stable.
- **Khi dùng**: cần O(n log n) worst in-place; **top-k** có thể dùng heap riêng hiệu quả hơn.

### 10. Counting Sort
- **Ý tưởng**: đếm tần suất giá trị trong khoảng nhỏ, prefix sum để xếp chỗ.
- **Time**: O(n + k), **Space**: O(k); `k` = số giá trị khác biệt / range.
- **Khi dùng**: key integer trong range nhỏ; không so sánh.

### 11. Radix Sort
- **Ý tưởng**: sort theo từng **chữ số** (hoặc byte) từ thấp đến cao, thường dùng counting/stable sort từng pass.
- **Time**: O(d · (n + r)), **Space**: O(n + r); `d` = số digit, `r` = cơ số.
- **Khi dùng**: số nguyên cố định độ dài bit/digit; IP, fixed-width keys.

---

## 12–24 — Đồ thị & lưới

### 12. Breadth-First Search (BFS)
- **Ý tưởng**: duyệt theo **tầng** bằng queue; đánh dấu đã thăm.
- **Time**: O(V + E), **Space**: O(V).
- **Khi dùng**: **đường đi ngắn nhất số cạnh** (unweighted), level-order, flood fill.

### 13. Depth-First Search (DFS)
- **Ý tưởng**: đi sâu nhất có thể, backtrack; stack đệ quy hoặc explicit.
- **Time**: O(V + E), **Space**: O(V) stack.
- **Khi dùng**: cycle detection, topo sort (variant), component, maze backtrack.

### 14. Dijkstra (shortest path, non-negative edge)
- **Ý tưởng**: **greedy** + priority queue; mở rộng đỉnh có dist nhỏ nhất.
- **Time**: O((V+E) log V) với binary heap thưa, **Space**: O(V).
- **Khi dùng**: routing, map, graph có trọng số ≥ 0.

### 15. Bellman-Ford
- **Ý tưởng**: relax tất cả cạnh **|V|-1** lần; phát hiện chu trình âm.
- **Time**: O(V·E), **Space**: O(V).
- **Khi dùng**: cạnh **âm** (không chu trình âm) hoặc cần detect negative cycle.

### 16. Floyd-Warshall (all-pairs shortest paths)
- **Ý tưởng**: DP qua đỉnh k làm trung gian: `dist[i][j] = min(..., dist[i][k]+dist[k][j])`.
- **Time**: O(V³), **Space**: O(V²).
- **Khi dùng**: đồ thị nhỏ, cần mọi cặp; closure transitive (biến thể).

### 17. A* Search
- **Ý tưởng**: best-first với `f = g + h`; `h` **admissible** (không overestimate) để tối ưu.
- **Time/Space**: phụ thuộc heuristic và graph; thường tốt hơn Dijkstra khi `h` chặt.
- **Khi dùng**: game/map AI, robot path có heuristic (Manhattan, Euclidean).

### 18. Topological Sort
- **Ý tưởng**: thứ tự đỉnh sao cho mọi cạnh u→v có u trước v; **Kahn** (BFS indegree) hoặc **DFS** post-order.
- **Time**: O(V + E), **Space**: O(V).
- **Khi dùng**: dependency resolution, build/task DAG, course schedule.

### 19. Kruskal (Minimum Spanning Tree)
- **Ý tưởng**: sort cạnh theo trọng số, thêm cạnh nếu không tạo cycle (**Union-Find**).
- **Time**: O(E log E), **Space**: O(V).
- **Khi dùng**: MST mạng, clustering cơ bản.

### 20. Prim (MST)
- **Ý tưởng**: mở rộng cây từ một đỉnh, luôn thêm cạnh nhẹ nhất nối ra ngoài (heap).
- **Time**: O(E log V) với heap, **Space**: O(V+E).
- **Khi dùng**: graph dày, một nguồn; tương đương Kruskal về kết quả MST.

### 21. Union-Find (Disjoint Set Union)
- **Ý tưởng**: **union by rank/size** + **path compression** cho near-constant amortized.
- **Time**: α(n) amortized per op, **Space**: O(n).
- **Khi dùng**: Kruskal, connected components, dynamic connectivity.

### 22. Edmonds-Karp (Max Flow)
- **Ý tưởng**: Ford-Fulkerson với **BFS** tìm augmenting path (shortest số cạnh).
- **Time**: O(V·E²), **Space**: O(V+E).
- **Khi dùng**: matching, assignment, min cut (max-flow min-cut theorem).

### 23. Tarjan / Kosaraju (Strongly Connected Components)
- **Tarjan**: DFS + lowlink một pass. **Kosaraju**: DFS + transpose DFS.
- **Time**: O(V + E), **Space**: O(V).
- **Khi dùng**: phân rã DAG của SCC, compiler/graph analysis.

### 24. Articulation Points & Bridges
- **Ý tưởng**: DFS tree + thời gian vào / low để phát hiện đỉnh/cạnh **cắt**.
- **Time**: O(V + E), **Space**: O(V).
- **Khi dùng**: độ tin cậy mạng, điểm yếu topology.

---

## 25–33 — Dynamic Programming & bài toán kinh điển

### 25. Longest Common Subsequence (LCS)
- **Ý tưởng**: DP `dp[i][j]` theo prefix hai chuỗi; chuyển khớp/không khớp.
- **Time**: O(n·m), **Space**: O(min(n,m)) có thể space-optimize.
- **Khi dùng**: diff (git-like), bioinformatics đơn giản.

### 26. 0/1 Knapsack
- **Ý tưởng**: mỗi vật chọn hoặc không; `dp[w]` cập nhật ngược capacity.
- **Time**: O(n·W), **Space**: O(W); pseudo-polynomial theo W.
- **Khi dùng**: tối ưu tài nguyên rời rạc, subset sum (biến thể).

### 27. Unbounded Knapsack / Coin Change (số cách / tối thiểu số xu)
- **Ý tưởng**: lặp qua coin/item và cập nhật DP theo weight/sum.
- **Time**: O(n·amount) typical, **Space**: O(amount).
- **Khi dùng**: đổi tiền, cắt vật liệu không giới hạn bản copy.

### 28. Edit Distance (Levenshtein)
- **Ý tưởng**: DP insert/delete/replace giữa hai chuỗi.
- **Time**: O(n·m), **Space**: O(min(n,m)) có optimize hàng.
- **Khi dùng**: spell check, fuzzy match, DNA alignment đơn giản.

### 29. Longest Increasing Subsequence (LIS)
- **Ý tưởng**: O(n²) DP đơn giản; O(n log n) với **patience sorting** + binary trên tail.
- **Time**: O(n log n) tối ưu, **Space**: O(n).
- **Khi dùng**: ranking, scheduling, analytics chuỗi.

### 30. Matrix Chain Multiplication
- **Ý tưởng**: DP trên đoạn `[i,j]` chọn điểm cắt k cuối cùng.
- **Time**: O(n³), **Space**: O(n²).
- **Khi dùng**: tối thứ tự nhân ma trận; min cost parse (tương tự interval DP).

### 31. Kadane’s Algorithm (Maximum Subarray Sum)
- **Ý tưởng**: duyệt một lần, giữ tổng đoạn hiện tại; reset khi âm (biến thể cho empty).
- **Time**: O(n), **Space**: O(1).
- **Khi dùng**: finance signals, rolling profit window.

### 32. House Robber / Interval DP trên dãy
- **Ý tưởng**: `dp[i] = max(dp[i-1], dp[i-2]+gain)` không lấy hai phần tử kề.
- **Time**: O(n), **Space**: O(1).
- **Khi dùng**: lịch không overlap, scheduler đơn giản.

### 33. Digit DP / DP trên bitmask (nhỏ)
- **Digit DP**: đếm số trong [L,R] thỏa điều kiện theo chữ số. **Bitmask DP**: subset trên n nhỏ (n ≤ 20–22).
- **Time**: phụ thuộc base/states; bitmask O(n·2^n) typical.
- **Khi dùng**: contest; scheduling nhỏ, TSP nhỏ (Held-Karp).

---

## 34–40 — Chuỗi, cây prefix, nén

### 34. KMP (Knuth–Morris–Pratt)
- **Ý tưởng**: **failure function** (prefix function) để không lùi vô ích trên text.
- **Time**: O(n + m), **Space**: O(m).
- **Khi dùng**: tìm pattern nhiều lần, streaming text.

### 35. Rabin-Karp (Rolling Hash)
- **Ý tưởng**: hash sliding window; so khớp thật khi hash trùng.
- **Time**: trung bình O(n+m), worst O(n·m) nếu hash kém; **double hash** giảm collision.
- **Khi dùng**: multi-pattern, plagiarism đơn giản, duplicate substring.

### 36. Z-Algorithm (Z-function)
- **Ý tưởng**: `Z[i]` = độ dài longest prefix khớp tại i; linear một pass thông minh.
- **Time**: O(n), **Space**: O(n).
- **Khi dùng**: pattern matching qua `pattern#text`, string analysis.

### 37. Trie (Prefix Tree)
- **Ý tưởng**: cây theo ký tự; path = prefix.
- **Time**: O(m) per op, **Space**: O(ALPHABET · nodes).
- **Khi dùng**: autocomplete, IP routing, dictionary prefix.

### 38. Huffman Coding
- **Ý tưởng**: greedy xây cây tần suất; mã ngắn cho ký tự hay gặp.
- **Time**: O(n log n) build, **Space**: O(n).
- **Khi dùng**: nén lossless (ZIP/PNG pipeline có bước tương tự), entropy coding.

### 39. Run-Length Encoding (RLE)
- **Ý tưởng**: gom chuỗi ký tự lặp thành (ký tự, count).
- **Time**: O(n), **Space**: output phụ thuộc dữ liệu.
- **Khi dùng**: ảnh đơn giản, fax; hiệu quả khi lặp nhiều.

### 40. Burrows-Wheeler Transform (BWT) — ý tưởng cốt lõi
- **Ý tưởng**: hoán vị có thể invert + nén tốt hơn sau MTF/RLE; dùng trong **bzip2**.
- **Time**: O(n) với suffix array + rank (implementation nặng), **Space**: O(n).
- **Khi dùng**: nén text; backend ít implement tay, hiểu để đọc format.

---

## 41–45 — Số học & bitwise

### 41. Euclidean Algorithm (GCD)
- **Ý tưởng**: `gcd(a,b)=gcd(b, a mod b)` đến khi b=0.
- **Time**: O(log min(a,b)), **Space**: O(1).
- **Khi dùng**: modular arithmetic, cryptography cơ bản, rationals.

### 42. Extended Euclidean
- **Ý tưởng**: tìm x,y sao cho ax + by = gcd(a,b); hỗ trợ **modular inverse**.
- **Time**: O(log min(a,b)), **Space**: O(1).
- **Khi dùng**: RSA/ECC prep, CRT.

### 43. Binary Exponentiation (Modular Pow)
- **Ý tưởng**: bình phương nhân lặp bit của exponent.
- **Time**: O(log exp), **Space**: O(1).
- **Khi dùng**: mod prime, hashing rolling, crypto.

### 44. Sieve of Eratosthenes
- **Ý tưởng**: đánh dấu bội số của mỗi số nguyên tố ≤ √n.
- **Time**: O(n log log n), **Space**: O(n).
- **Khi dùng**: primes tới n vừa phải, totient batch (biến thể).

### 45. Fast Fourier Transform (FFT) / NTT
- **Ý tưởng**: nhân đa thức / convolution trong O(n log n) qua domain tần số; **NTT** mod prime.
- **Time**: O(n log n), **Space**: O(n).
- **Khi dùng**: signal, large integer multiply, string matching count (pattern với wildcard) — advanced.

---

## 46–50 — Cấu trúc trên mảng & kỹ thuật lặp

### 46. Fenwick Tree (Binary Indexed Tree)
- **Ý tưởng**: prefix sum / point update qua bit trick `i += i & -i`.
- **Time**: O(log n) per op, **Space**: O(n).
- **Khi dùng**: inversion count, dynamic prefix, 2D variant cho grid nhỏ.

### 47. Segment Tree
- **Ý tưởng**: cây phân đoạn; mỗi node = aggregate đoạn (sum/min/max/lazy prop).
- **Time**: O(log n) query/update, **Space**: O(n).
- **Khi dùng**: range query dynamic, lazy range add/set.

### 48. Sparse Table (RMQ static)
- **Ý tưởng**: DP `st[k][i]` = min/max trên đoạn dài 2^k bắt đầu i; query O(1) idempotent.
- **Time**: build O(n log n), query O(1), **Space**: O(n log n).
- **Khi dùng**: static range min/max/gcd (overlap-friendly).

### 49. Two Pointers
- **Ý tưởng**: hai chỉ số trên một/two mảng (thường **sorted**), di chuyển theo điều kiện so sánh (sum, distance, partition).
- **Time**: thường O(n) hoặc O(n+m), **Space**: O(1) extra.
- **Khi dùng**: two-sum sorted, merge đường thẳng, quicksort partition, remove duplicates sorted.

### 50. Sliding Window
- **Ý tưởng**: duy trì đoạn [L,R] với **invariant** (tổng, tần suất, max queue); R tiến, L co khi vi phạm.
- **Time**: mỗi phần tử vào/ra tối đa vài lần → O(n), **Space**: O(k) hoặc O(alphabet).
- **Khi dùng**: substring tối đa/thỏa điều kiện, rate limit theo cửa thời gian, stream analytics.

---

## Cách dùng rule này trong code backend

- **Ưu tiên thư viện chuẩn** (`Array.sort`, `Map`/`Set`, DB index) trước khi tự cài sort/graph nặng.
- **Chọn thuật toán theo constraint**: kích thước input, cần stable hay không, online/stream hay batch, worst-case SLA.
- **Độ phức tạt vẫn tính cả I/O và memory**: thuật toán O(n) với disk random read có thể thua scan tuần tự + index.
- **Meet-in-the-Middle** (không nằm trong 50 tiêu đề): chia tập đôi + sort/hash nửa — O(2^(n/2)); dùng khi n ~ 40 và bài toán subset/partition.
