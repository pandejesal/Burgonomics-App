/**
 * AudioService for micro-interactions.
 * Uses the Web Audio API to synthesize lightweight UI sounds without loading MP3s.
 */
export class AudioService {
  private static ctx: AudioContext | null = null;
  private static initContext() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  static playClick() {
    try {
      this.initContext();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.type = "sine";
      osc.frequency.setValueAtTime(600, t);
      osc.frequency.exponentialRampToValueAtTime(300, t + 0.05);
      
      gain.gain.setValueAtTime(0.1, t); // Reduced volume to not overwhelm
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
      
      osc.start(t);
      osc.stop(t + 0.05);
    } catch (e) {
      // ignore
    }
  }

  static playSuccess() {
    try {
      this.initContext();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.type = "sine";
      osc.frequency.setValueAtTime(523.25, t); // C5
      osc.frequency.setValueAtTime(659.25, t + 0.1); // E5
      
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.1, t + 0.05); // Very soft
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
      
      osc.start(t);
      osc.stop(t + 0.3);
    } catch (e) {
      // ignore
    }
  }
}
