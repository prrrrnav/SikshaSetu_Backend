const { Server } = require('socket.io');
const { db, admin } = require('./config/Firebase');

let io;

// Helper function to optimize SDP for Opus 16kbps with FEC
const optimizeSDPForOpus = (sdp) => {
  let modifiedSdp = sdp;
  
  // Find Opus payload type
  const opusPayload = sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/);
  if (opusPayload) {
    const payloadType = opusPayload[1];
    
    // Prioritize Opus codec
    modifiedSdp = modifiedSdp.replace(
      /(m=audio \d+ [\w\/]+ )(.*)/,
      (match, prefix, codecs) => {
        const codecList = codecs.trim().split(' ');
        const filtered = codecList.filter(c => c !== payloadType);
        return `${prefix}${payloadType} ${filtered.join(' ')}`;
      }
    );
    
    // Add Opus optimization parameters for 16kbps with error correction
    const fmtpLine = `a=fmtp:${payloadType} minptime=10;useinbandfec=1;maxaveragebitrate=16000;stereo=0;sprop-stereo=0;cbr=1\r\n`;
    
    // Replace existing fmtp line or add new one
    if (modifiedSdp.includes(`a=fmtp:${payloadType}`)) {
      modifiedSdp = modifiedSdp.replace(
        new RegExp(`a=fmtp:${payloadType}[^\\r\\n]*\\r\\n`),
        fmtpLine
      );
    } else {
      modifiedSdp = modifiedSdp.replace(
        `a=rtpmap:${payloadType} opus/48000/2`,
        `a=rtpmap:${payloadType} opus/48000/2\r\n${fmtpLine.trim()}`
      );
    }
  }
  
  return modifiedSdp;
};

const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: true,
      credentials: true
    },
    pingTimeout: 30000,
    pingInterval: 25000,
    upgradeTimeout: 10000,
    maxHttpBufferSize: 1e7, // Support larger slide images (10MB)
    transports: ['websocket', 'polling']
  });

  const liveSessionNamespace = io.of('/live-session');

  liveSessionNamespace.on('connection', (socket) => {
    console.log("Client connected:", socket.id);

    // Join session
    socket.on("join-session", async ({ sessionId, userId, userName, role }) => {
      try {
        const sessionRef = db.collection("liveSessions").doc(sessionId);
        const sessionDoc = await sessionRef.get();

        if (!sessionDoc.exists) {
          socket.emit("error", { message: "Session not found" });
          return;
        }

        const session = sessionDoc.data();
        if (!session.isActive) {
          socket.emit("error", { message: "Session not active" });
          return;
        }

        socket.join(sessionId);
        socket.sessionId = sessionId;
        socket.userId = userId;
        socket.userName = userName;
        socket.role = role;

        if (role === "student") {
          await sessionRef.update({
            participants: admin.firestore.FieldValue.arrayUnion(userId),
          });
        }

        liveSessionNamespace.to(sessionId).emit("user-joined", {
          userId,
          userName,
          role,
          participantCount: session.participants
            ? session.participants.length + 1
            : 1,
        });

        // Send current slide state to the newly joined student directly from the database
        if (role === "student") {
          const currentIndex = session.currentSlideIndex || 0;
          let slideImage = session.currentSlideImage;

          // FIX 1: Improved fallback — use slides[0] if currentSlideImage missing
          if (!slideImage && Array.isArray(session.slides) && session.slides.length > 0) {
            const slideData = session.slides[currentIndex] ?? session.slides[0];
            slideImage = typeof slideData === 'string' ? slideData : slideData?.imageUrl;
          }

          if (slideImage) {
            console.log(`[Sync] Sending initial slide [${currentIndex}] to student ${userId}`);
            socket.emit("slide-changed", {
              slideIndex: currentIndex,
              slideImage,
              changedBy: "System (Direct Sync)",
            });
          } else if (session.isActive) {
            // FIX 1: Session is live but no slide image found — ask teacher to re-broadcast
            socket.to(sessionId).emit("request-slide-sync", {
              requestedBy: socket.id,
            });
          }
        }

        console.log(`${userName} (${role}) joined session ${sessionId}`);
      } catch (error) {
        console.error("Join session error:", error);
        socket.emit("error", { message: "Failed to join session" });
      }
    });

    // Slide synchronization - change slide
    socket.on("change-slide", async ({ sessionId, slideIndex, slideImage }) => {
      try {
        const currentRole = socket.role || "unknown";
        if (currentRole !== "teacher") {
          console.warn(`[Blocked] Slide change attempt by ${socket.userName || 'unknown'}. Role: ${currentRole}`);
          socket.emit("error", { message: "Only teacher can change slides" });
          return;
        }

        // --- PHASE 4: Debug Room Occupancy ---
        const room = liveSessionNamespace.adapter.rooms.get(sessionId);
        const numClients = room ? room.size : 0;
        console.log(`[Sync] Teacher ${socket.userName} -> Slide ${slideIndex} (Room: ${sessionId}, Clients: ${numClients})`);

        // Broadcast immediately to everyone in the room
        liveSessionNamespace.to(sessionId).emit("slide-changed", {
          slideIndex,
          slideImage,
          changedBy: socket.userName,
        });

        // Persist to database in the background
        const sessionRef = db.collection("liveSessions").doc(sessionId);
        sessionRef.update({
          currentSlideIndex: slideIndex,
          currentSlideImage: slideImage,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }).catch(err => console.error("[Sync] Firestore update failed:", err));

      } catch (error) {
        console.error("Change slide error:", error);
        socket.emit("error", { message: "Failed to change slide" });
      }
    });

    // Slide synchronization - upload new slide
    socket.on("slide-uploaded", async ({ sessionId, slideUrl, slideIndex }) => {
      try {
        if (socket.role !== "teacher") {
          socket.emit("error", { message: "Only teacher can upload slides" });
          return;
        }

        liveSessionNamespace.to(sessionId).emit("new-slide-available", {
          slideUrl,
          slideIndex,
          uploadedBy: socket.userName,
          timestamp: new Date().toISOString(),
        });

        console.log(`New slide uploaded to session ${sessionId}`);
      } catch (error) {
        console.error("Slide upload notification error:", error);
      }
    });

    // WebRTC signaling - Offer (with Opus optimization)
    socket.on("webrtc-offer", ({ sessionId, offer, targetSocketId }) => {
      try {
        // --- FIX: Send original offer (Disable optimization) ---
        const optimizedOffer = offer;

        // Comment out the optimization line for now:
        // const optimizedOffer = {
        //   type: offer.type,
        //   sdp: optimizeSDPForOpus(offer.sdp)
        // };

        socket.to(targetSocketId).emit("webrtc-offer", {
          offer: optimizedOffer, // Sending raw offer
          fromSocketId: socket.id,
        });

        console.log(`WebRTC offer sent from ${socket.id} to ${targetSocketId}`);
      } catch (error) {
        console.error("WebRTC offer error:", error);
        socket.emit("error", { message: "Failed to process offer" });
      }
    });

    // WebRTC signaling - Answer (with Opus optimization)
    socket.on("webrtc-answer", ({ sessionId, answer, targetSocketId }) => {
      try {
        // --- FIX: Send original answer (Disable optimization) ---
        const optimizedAnswer = answer;

        // Comment out the optimization line for now:
        // const optimizedAnswer = {
        //   type: answer.type,
        //   sdp: optimizeSDPForOpus(answer.sdp)
        // };

        socket.to(targetSocketId).emit("webrtc-answer", {
          answer: optimizedAnswer, // Sending raw answer
          fromSocketId: socket.id,
        });

        console.log(
          `WebRTC answer sent from ${socket.id} to ${targetSocketId}`
        );
      } catch (error) {
        console.error("WebRTC answer error:", error);
        socket.emit("error", { message: "Failed to process answer" });
      }
    });

    // WebRTC signaling - ICE candidate
    socket.on(
      "webrtc-ice-candidate",
      ({ sessionId, candidate, targetSocketId }) => {
        socket.to(targetSocketId).emit("webrtc-ice-candidate", {
          candidate,
          fromSocketId: socket.id,
        });
      }
    );

    // Request teacher's audio stream
    socket.on("request-teacher-stream", ({ sessionId }) => {
      const teacherSockets = Array.from(
        liveSessionNamespace.sockets.values()
      ).filter((s) => s.sessionId === sessionId && s.role === "teacher");

      if (teacherSockets.length > 0) {
        teacherSockets[0].emit("student-requesting-stream", {
          studentSocketId: socket.id,
        });
      } else {
        socket.emit("error", { message: "Teacher not available" });
      }
    });

    // Chat messaging
    socket.on("send-chat-message", async ({ sessionId, message }) => {
      try {
        const chatMessage = {
          messageId: Date.now().toString(),
          userId: socket.userId,
          userName: socket.userName,
          role: socket.role,
          message,
          timestamp: new Date().toISOString(),
        };

        const realtimeDb = admin.database();
        await realtimeDb
          .ref(`liveSessions/${sessionId}/chat`)
          .push(chatMessage);

        liveSessionNamespace.to(sessionId).emit("chat-message", chatMessage);
      } catch (error) {
        console.error("Send chat message error:", error);
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    // Understood button
    socket.on("understood", async ({ sessionId }) => {
      try {
        const sessionRef = db.collection("liveSessions").doc(sessionId);
        await sessionRef.update({
          understoodCount: admin.firestore.FieldValue.increment(1),
        });

        const sessionDoc = await sessionRef.get();
        const understoodCount = sessionDoc.data().understoodCount;

        liveSessionNamespace.to(sessionId).emit("understood-count-updated", {
          understoodCount,
        });
      } catch (error) {
        console.error("Understood count error:", error);
      }
    });

    // Material upload notification
    socket.on("material-uploaded", ({ sessionId, material }) => {
      liveSessionNamespace.to(sessionId).emit("new-material", material);
    });

    // Annotation drawing
    socket.on("draw-annotation", ({ sessionId, slideIndex, data }) => {
      try {
        if (socket.role !== "teacher") {
          socket.emit("error", {
            message: "Only teacher can draw annotations",
          });
          return;
        }

        liveSessionNamespace.to(sessionId).emit("annotation-draw", {
          slideIndex,
          data,
          timestamp: new Date().toISOString(),
        });

        console.log(`Annotation drawn by teacher in session ${sessionId}`);
      } catch (error) {
        console.error("Annotation draw error:", error);
      }
    });
    
    // Start a new stroke (for undo grouping)
    socket.on("start-stroke", ({ sessionId, slideIndex }) => {
      if (socket.role !== "teacher") return;
      liveSessionNamespace.to(sessionId).emit("start-stroke", { slideIndex });
    });

    // End the current stroke
    socket.on("end-stroke", ({ sessionId, slideIndex }) => {
      if (socket.role !== "teacher") return;
      liveSessionNamespace.to(sessionId).emit("end-stroke", { slideIndex });
    });

    // Undo the last stroke
    socket.on("undo-annotation", ({ sessionId, slideIndex }) => {
      if (socket.role !== "teacher") return;
      liveSessionNamespace.to(sessionId).emit("undo-annotation", { slideIndex });
    });

    // Clear the entire canvas
    socket.on("clear-canvas", ({ sessionId, slideIndex }) => {
      if (socket.role !== "teacher") return;
      liveSessionNamespace.to(sessionId).emit("clear-canvas", { slideIndex });
    });

    // Network quality monitoring
    socket.on("network-quality-report", async ({ sessionId, quality }) => {
      try {
        // quality: 'good' | 'fair' | 'poor'

        if (quality === "poor" && socket.role === "teacher") {
          liveSessionNamespace.to(sessionId).emit("network-quality-warning", {
            message: "Teacher experiencing network issues",
            severity: "warning",
            timestamp: new Date().toISOString(),
          });
        }

        console.log(`Network quality for ${socket.userName}: ${quality}`);
      } catch (error) {
        console.error("Network quality report error:", error);
      }
    });

    // FIX 5: Backend handler for request-sync
    socket.on("request-sync", async ({ sessionId }) => {
      try {
        const sessionRef = db.collection("liveSessions").doc(sessionId);
        const sessionDoc = await sessionRef.get();
        if (!sessionDoc.exists) return;
        
        const session = sessionDoc.data();
        let slideImage = session.currentSlideImage;
        const currentIndex = session.currentSlideIndex || 0;
        
        // FIX 1 & 5: Robust fallback — check slides array if currentSlideImage is null
        if (!slideImage && Array.isArray(session.slides) && session.slides.length > 0) {
          const slideData = session.slides[currentIndex] ?? session.slides[0];
          slideImage = typeof slideData === 'string' ? slideData : slideData?.imageUrl;
        }

        if (slideImage) {
          socket.emit("slide-changed", { 
            slideIndex: currentIndex, 
            slideImage, 
            changedBy: "System (Re-sync)" 
          });
        } else if (session.isActive) {
          // If still no image but session is active, ask teacher to re-broadcast
          socket.to(sessionId).emit("request-slide-sync", {
            requestedBy: socket.id,
          });
        }
      } catch (error) {
        console.error("Request sync error:", error);
      }
    });

    // Reconnection handling
    socket.on("reconnect-to-session", async ({ sessionId, userId }) => {
      try {
        const sessionRef = db.collection("liveSessions").doc(sessionId);
        const sessionDoc = await sessionRef.get();

        if (!sessionDoc.exists || !sessionDoc.data().isActive) {
          socket.emit("error", { message: "Session no longer active" });
          return;
        }

        socket.join(sessionId);
        socket.sessionId = sessionId;

        liveSessionNamespace.to(sessionId).emit("user-reconnected", {
          userId,
          userName: socket.userName,
          timestamp: new Date().toISOString(),
        });

        console.log(`${socket.userName} reconnected to session ${sessionId}`);
      } catch (error) {
        console.error("Reconnection error:", error);
        socket.emit("error", { message: "Failed to reconnect" });
      }
    });

    // Disconnect handling
    socket.on("disconnect", async () => {
      console.log("Client disconnected:", socket.id);

      if (socket.sessionId && socket.userId) {
        liveSessionNamespace.to(socket.sessionId).emit("user-left", {
          userId: socket.userId,
          userName: socket.userName,
          role: socket.role,
        });
      }
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO not initialized');
  }
  return io;
};

module.exports = { initializeSocket, getIO };