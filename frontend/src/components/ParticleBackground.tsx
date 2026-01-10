import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  speed: number;
  trail: { x: number; y: number }[];
}

interface ParticleBackgroundProps {
  intensity?: number; // 0-1, controls spawn rate
  speedMultiplier?: number; // 1 = normal, higher = faster
}

export function ParticleBackground({ intensity = 0, speedMultiplier = 1 }: ParticleBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationRef = useRef<number>();
  const intensityRef = useRef(intensity);
  const speedMultiplierRef = useRef(speedMultiplier);

  // Update refs when props change
  useEffect(() => {
    intensityRef.current = intensity;
    speedMultiplierRef.current = speedMultiplier;
  }, [intensity, speedMultiplier]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Particle colors (orange/purple theme - softer)
    const colors = [
      'rgba(249, 115, 22, 0.6)',    // orange-500
      'rgba(251, 146, 60, 0.5)',    // orange-400
      'rgba(139, 92, 246, 0.4)',    // purple-500
      'rgba(168, 85, 247, 0.4)',    // purple-400
      'rgba(236, 72, 153, 0.3)',    // pink-500
      'rgba(255, 255, 255, 0.3)',   // white
    ];

    // Create a particle that shoots toward center
    const createParticle = (baseSpeed?: number): Particle => {
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      
      // Spawn from random edge
      let x: number, y: number;
      const edge = Math.floor(Math.random() * 4);
      const margin = 50;
      
      switch (edge) {
        case 0: // Top
          x = Math.random() * canvas.width;
          y = -margin;
          break;
        case 1: // Right
          x = canvas.width + margin;
          y = Math.random() * canvas.height;
          break;
        case 2: // Bottom
          x = Math.random() * canvas.width;
          y = canvas.height + margin;
          break;
        default: // Left
          x = -margin;
          y = Math.random() * canvas.height;
          break;
      }
      
      // Calculate direction to center
      const dx = centerX - x;
      const dy = centerY - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // Speed varies for visual interest (slower base speed)
      const speed = baseSpeed || (1 + Math.random() * 2);
      
      return {
        x,
        y,
        vx: (dx / dist) * speed,
        vy: (dy / dist) * speed,
        size: Math.random() * 1.5 + 0.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 0.4 + Math.random() * 0.3,
        speed,
        trail: [],
      };
    };

    // Initialize particles
    const baseParticleCount = 40;
    particlesRef.current = Array.from({ length: baseParticleCount }, () => createParticle());

    let lastSpawnTime = 0;

    // Animation loop
    const animate = (timestamp: number) => {
      // Clear with fade for trail effect
      ctx.fillStyle = 'rgba(15, 10, 26, 0.12)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const particles = particlesRef.current;
      const currentIntensity = intensityRef.current;
      const currentSpeedMult = speedMultiplierRef.current;

      // Spawn extra particles when intensity is high (less aggressive)
      if (currentIntensity > 0) {
        const spawnInterval = Math.max(80, 200 - currentIntensity * 120);
        if (timestamp - lastSpawnTime > spawnInterval) {
          const extraParticles = Math.ceil(currentIntensity * 2);
          for (let i = 0; i < extraParticles; i++) {
            const speed = (1.5 + Math.random() * 2) * currentSpeedMult;
            particles.push(createParticle(speed));
          }
          lastSpawnTime = timestamp;
        }
      }

      // Draw subtle center glow
      const glowIntensity = 0.08 + currentIntensity * 0.12;
      const glowSize = 80 + currentIntensity * 30;
      const centerGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, glowSize);
      centerGradient.addColorStop(0, `rgba(249, 115, 22, ${glowIntensity})`);
      centerGradient.addColorStop(0.5, `rgba(139, 92, 246, ${glowIntensity * 0.4})`);
      centerGradient.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(centerX, centerY, glowSize, 0, Math.PI * 2);
      ctx.fillStyle = centerGradient;
      ctx.fill();

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];

        // Store trail position
        p.trail.push({ x: p.x, y: p.y });
        const maxTrailLength = 10 + Math.floor(currentIntensity * 5);
        if (p.trail.length > maxTrailLength) {
          p.trail.shift();
        }

        // Update position - apply speed multiplier
        p.x += p.vx * currentSpeedMult;
        p.y += p.vy * currentSpeedMult;

        // Calculate distance to center
        const dx = centerX - p.x;
        const dy = centerY - p.y;
        const distToCenter = Math.sqrt(dx * dx + dy * dy);

        // Fade as approaching center
        if (distToCenter < 120) {
          p.alpha = (distToCenter / 120) * 0.5;
        }

        // Reset particle when it reaches center or fades out
        if (distToCenter < 15 || p.alpha <= 0.03) {
          // Remove extra particles gradually when intensity is low
          if (particles.length > baseParticleCount && currentIntensity < 0.1) {
            particles.splice(i, 1);
          } else {
            // Always respawn the particle
            const newSpeed = (1 + Math.random() * 2) * (currentIntensity > 0 ? currentSpeedMult : 1);
            Object.assign(p, createParticle(newSpeed));
          }
          continue;
        }

        // Draw trail (more subtle)
        if (p.trail.length > 1) {
          ctx.beginPath();
          ctx.moveTo(p.trail[0].x, p.trail[0].y);
          for (let j = 1; j < p.trail.length; j++) {
            ctx.lineTo(p.trail[j].x, p.trail[j].y);
          }
          ctx.lineTo(p.x, p.y);
          
          const trailGradient = ctx.createLinearGradient(
            p.trail[0].x, p.trail[0].y, p.x, p.y
          );
          trailGradient.addColorStop(0, 'transparent');
          trailGradient.addColorStop(1, p.color.replace(/[\d.]+\)$/, `${p.alpha * 0.4})`));
          
          ctx.strokeStyle = trailGradient;
          ctx.lineWidth = p.size * (1 + currentIntensity * 0.3);
          ctx.lineCap = 'round';
          ctx.stroke();
        }

        // Draw particle head
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.2 + currentIntensity * 0.3), 0, Math.PI * 2);
        ctx.fillStyle = p.color.replace(/[\d.]+\)$/, `${p.alpha * 0.8})`);
        ctx.fill();

        // Draw subtle glow around particle
        const glowRadius = p.size * (2.5 + currentIntensity * 1);
        const particleGlow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowRadius);
        particleGlow.addColorStop(0, p.color.replace(/[\d.]+\)$/, `${p.alpha * 0.25})`));
        particleGlow.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.arc(p.x, p.y, glowRadius, 0, Math.PI * 2);
        ctx.fillStyle = particleGlow;
        ctx.fill();
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    // Start animation
    animationRef.current = requestAnimationFrame(animate);

    // Cleanup
    return () => {
      window.removeEventListener('resize', resize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-0 pointer-events-none"
      style={{ background: 'transparent' }}
    />
  );
}
