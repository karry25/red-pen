// Red Pen agent base.
// Every module is a real agent: own role (instructions), own tools, own
// session memory, and a brain. The brain is pluggable: today it is a
// rule-based brain (no API key, fully testable); when a free Gemini/Groq
// key is approved, an LLM brain drops in without changing the agent's
// role, tools, or hand-offs.
class Agent {
  constructor({ name, role, tools = {} }) {
    this.name = name;          // shown in the UI activity feed
    this.role = role;          // the agent's standing instructions (system persona)
    this.tools = tools;        // named functions the agent may call
    this.memory = [];          // session memory: what this agent has seen/done
    this.brain = null;         // LLM brain set later via setBrain()
  }

  setBrain(brainFn) { this.brain = brainFn; }

  remember(entry) {
    this.memory.push({ at: new Date().toISOString(), ...entry });
  }

  // One work step: records a visible trace line for the UI, then runs fn.
  async act(trace, action, fn) {
    trace.push({ agent: this.name, action });
    const out = await fn();
    this.remember({ action });
    return out;
  }

  // Reasoning hook. Uses the LLM brain when present, otherwise the
  // rule-based fallback. The fallback is real logic, never a fake.
  async think(context, fallback) {
    if (this.brain) return this.brain({ role: this.role, context });
    return fallback();
  }
}

module.exports = { Agent };
