# 🚀 KubeChat Microservices - Master Features Tracker

Here is the single, unified master table containing every feature, optimization, and security patch we have built together chronologically!

| Category | Feature | Type | Description |
| :--- | :--- | :--- | :--- |
| **1. Authentication & Security** | Login Rate Limiter | Security | Brute-force protection using `express-rate-limit`. Rejects IPs attempting to hit `/api/auth/login` more than 5 times per minute. |
| **1. Authentication & Security** | Optimized JWT Payloads | Optimization | JWT payloads are strictly minimized to `{ userId, email }`, keeping tokens lightweight and preventing data leakage. |
| **1. Authentication & Security** | Secure Auth Middleware | Security | Intercepts bearer tokens, verifies them natively, and fetches the `User` from MongoDB while explicitly removing the password (`.select("-password")`). |
| **1. Authentication & Security** | Dual-Token Lifecycle | Architecture | Replaced permanent JWTs with rotating tokens. Issues a short-lived **Access Token** (15 mins) and a long-lived **Refresh Token** (7 days) saved in the DB. |
| **1. Authentication & Security** | Secure Logout Engine | Data Integrity | Hitting `/api/auth/logout` explicitly targets the user's secure database row and permanently erases their active `refreshToken`. |
| **2. Discovery & Optimization**| Native Text Indexing | Scalability | Replaced slow `$regex` full-table scans with pure MongoDB `$text` compound indexing covering both `name` and `email` properties. |
| **2. Discovery & Optimization**| Relevance Sorting | Unique Feature | The Text search projects a unique `$meta: "textScore"`, automatically sorting search results by highest contextual match (similar to Google). |
| **2. Discovery & Optimization**| API Pagination | Performance | Both `getAllUsers` and `searchUsers` cleanly accept `?page=1&limit=10` query logic to prevent the server from crashing when loading massive lists. |
| **2. Discovery & Optimization**| Hybrid Search Fallback| Unique Feature | Built a custom logic layer that detects `< 3` character searches and dynamically fails over to a `$regex` partial match for short names. |
| **3. Grouped Conversations** | Conversation Layer | Architecture | Abstracted loose messages into a `Conversation` schema that structurally binds two users together, replicating real-world designs like WhatsApp. |
| **3. Grouped Conversations** | Automated Chat Grouping| Execution | When calling `sendMessage`, the backend checks if a Conversation exists between the users. If not, it automatically creates one in the background. |
| **3. Grouped Conversations** | Chat List Previews | Unique Feature | The schema automatically updates `lastMessage` and `lastMessageAt`, allowing `/api/conversations` to render a user's inbox sorted by newest activity. |
| **3. Grouped Conversations** | Multi-Directional Indexing| Performance | Added dual compound indexes to the `Message` table on `(senderId, receiverId)` and `(receiverId, senderId)` for instant, scalable history retrieval. |
| **4. Real-Time Socket.IO Base**| Live Online Hub | Networking | Dynamically tracks precisely who is online. Triggers `getOnlineUsers` broadcasts exclusively whenever someone signs into the app or closes their tab. |
| **4. Real-Time Socket.IO Base**| Isolated Typing Indicators| Privacy | Rather than blasting everyone online, `typing` events strictly join specific MongoDB `conversationId` rooms, bounding visual noise to the two people chatting. |
| **4. Real-Time Socket.IO Base**| Rest/Socket Hybrid Push | Unique Feature | Modified the HTTP `POST /sendMessage` API. Once written to MongoDB, the backend instantly scans the target user's active sockets and bursts out a live `newMessage` event. |
| **5. Advanced Multi-Device Sockets**| Strict Socket JWT Auth | Security | Connected `io.use` natively. The WebSocket handshake parses the JWT token natively. If a hacker tries connecting without a valid token, the server strictly rejects the connection. |
| **5. Advanced Multi-Device Sockets**| Multi-Browser Delivery Maps | Unique Feature | The system handles users connected on their Phone AND Laptop simultaneously. It uses memory arrays (`[socket1, socket2]`) to deliver live messages securely to **ALL** active connected sessions. |
| **5. Advanced Multi-Device Sockets**| Live Read Receipts (isSeen) | Architecture | New API route `PUT /api/messages/:conversationId/seen`. When opened, it runs `$set` in MongoDB, and instantly executes a live WebSocket burst (`messagesSeen`) directly to the sender so their UI can display a blue tick. |
| **6. React Frontend & UX**| React Application Frontend | Architecture | Built dynamic `ChatPage`, `ChatSidebar`, and `ChatWindow` replacing static pages with a fully integrated real-time chat environment. |
| **6. React Frontend & UX**| Tailwind V4 Engine Update | Optimization | Purged legacy V3 PostCSS compilers, mounting the modern `@tailwindcss/vite` engine directly into the React/Vite compiler. |
| **6. React Frontend & UX**| Smart Auto-Scroll | UX Upgrade | Chat window mathematically measures scroll depth. Avoids forcing the screen to the bottom if the user is reading history. |
| **6. React Frontend & UX**| Throttled Typing Engine | Performance | `isTyping` boolean lock + 1.5s idle-clock prevents keyboard spam from overloading the WebSocket server. |
| **6. React Frontend & UX**| Anti-Race Condition Lock | Data Integrity | Duplicate-prevention check (`msg._id` comparison) stops the same message appearing twice from simultaneous HTTP + Socket delivery. |
| **6. React Frontend & UX**| Real-Time Unread Badges | UX Upgrade | Conversation list increments a red badge counter when a message arrives for an inactive chat, and resets on open. |
| **6. React Frontend & UX**| Reconnection Monitor | UX Upgrade | Mounts `socket.on('disconnect')` hooks and renders an animated `Reconnecting…` pill badge in the header on WiFi drop. |
| **6. React Frontend & UX**| Protected Route HOCs | Security | Higher-Order Components redirect unauthenticated users away from chat pages. |
| **7. Delivery Status System**| Triple-Status Message Ticks | Unique Feature | WhatsApp-style lifecycle: `sent` (✓ gray), `delivered` (✓✓ gray), `seen` (✓✓ violet). Driven by a 3-value Mongoose enum replacing the old boolean `isSeen`. |
| **7. Delivery Status System**| Instant Delivered on Send | Optimization | `sendMessage` controller checks `userSocketMap` at time of send. If receiver is already online, the message is saved directly as `"delivered"` — skipping the `"sent"` state. |
| **7. Delivery Status System**| Auto-Deliver on Login | Automation | On socket `connection`, the server queries all `"sent"` messages addressed to the newly online user, bulk-updates them to `"delivered"`, and bursts `messagesDelivered` to the original senders live. |
| **7. Delivery Status System**| Blue Tick Read Receipts | UX Upgrade | Opening a conversation calls `PUT /seen`, running a bulk `$set { status: "seen" }` and emitting `messagesSeen` to the sender's active sockets, flipping ticks to violet in real-time. |
| **7. Delivery Status System**| Chat Preview Mode | Unique Feature | Opening a chat does **not** fire `/seen`. Read receipts only trigger on physical click/focus inside the canvas. Press `Escape` to close with unread badges fully intact. |
| **8. Floating Chat Workspace**| Full-Screen Focus Layout | Architecture | Eliminated the traditional two-column sidebar. The entire viewport is the chat canvas — centered `max-w-3xl` conversation with ambient gradient blobs behind it. |
| **8. Floating Chat Workspace**| ConversationOverlay Panel | UX Upgrade | A floating `💬 Chats` pill button (bottom-left) triggers an animated glassmorphic overlay listing all conversations. Clicking outside dismisses it. |
| **8. Floating Chat Workspace**| Bubble Appear Animation | Visual Polish | Every message entry triggers a `@keyframes bubbleAppear` fade + slide-up (0.22s ease-out) defined in `index.css`. |
| **8. Floating Chat Workspace**| Dark Glassmorphic Theme | Visual Polish | Deep `slate-950 → indigo-950 → purple-950` gradient backdrop. Message bubbles use violet gradients (own) and `bg-white/8 backdrop-blur` (received). |
| **8. Floating Chat Workspace**| Centered 3-Section Navbar | UX Upgrade | Chat header uses equal `w-1/3` columns (LEFT: avatar, CENTER: name + status, RIGHT: reconnect badge) guaranteeing true horizontal centering of the user's name. |
| **8. Floating Chat Workspace**| Dark-Theme Emoji Picker | Integration | `emoji-picker-react` rendered in `theme="dark"`, centered above the input bar. Toggle button switches to an `X` icon when open. Closes automatically on send. |
| **8. Floating Chat Workspace**| Web Audio Notification Ping | Performance | Zero-dependency synthesizer using `AudioContext` plays a D5→A5 sine-wave ping when a message arrives in an inactive conversation. |
| **9. Deployment** | Backend Dockerfile | Documentation | Dockerfile for Node/Express backend (port 5000, production‑only deps). |
| **9. Deployment** | Frontend Dockerfile | Documentation | Multi‑stage Dockerfile for Vite/React frontend (build with Node, serve with nginx). |
| **9. Deployment** | Docker Compose | DevOps | Single `docker-compose up` spins up MongoDB, backend, and frontend. Backend connects via Docker DNS (`mongodb://mongo:27017`). |
| **9. Deployment** | Nginx Reverse Proxy | Networking | Custom `nginx.conf` proxies `/api/` and `/socket.io/` to the backend container with WebSocket upgrade support, enabling SPA routing and same-origin API access. |
| **9. Deployment** | Environment-Aware URLs | Architecture | `VITE_API_BASE` env var lets the frontend swap between `localhost:5000` (dev) and relative URLs (Docker) at build time. |
| **9. Deployment** | Docker Hub Registry | DevOps | Production images pushed to Docker Hub as `mittal122/kubechat-microservices-backend` and `mittal122/kubechat-microservices-frontend`. Anyone can pull and run the full app. |

