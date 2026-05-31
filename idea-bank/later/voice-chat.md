# Voice Chat Interface
**Added:** 2026-05-31

Voice-first conversation with Tali — ask questions and give commands by voice instead of typing.

**Inspiration:** https://get-monai.app

**Why it fits Tali:**
- SEA users skew mobile-first; voice lowers the Web3 barrier significantly
- "What's my net worth?" spoken is more natural than typed for non-crypto users
- Could replace or complement the Rules NL input

**What it would take:**
- Speech-to-text (Whisper API or browser Web Speech API)
- Claude API with tool calls (tali-cli + byreal-cli) as the brain
- Text-to-speech for responses
- Mobile-optimized UI

**Why parked:**
- ~1 week of work minimum
- Current dashboard design (autonomous rules, activity feed) is already a stronger hackathon demo
- Agent autonomy story > Q&A story for Agentic Economy track
