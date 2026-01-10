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

    // Particle colors (orange/purple theme)
    const colors = [
      'rgba(249, 115, 22, 1)',    // orange-500
      'rgba(251, 146, 60, 1)',    // orange-400
      'rgba(139, 92, 246, 1)',    // purple-500
      'rgba(168, 85, 247, 1)',    // purple-400
      'rgba(236, 72, 153, 1)',    // pink-500
      'rgba(255, 255, 255, 1)',   // white
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
      
      // Speed varies for visual interest
      const speed = baseSpeed || (2 + Math.random() * 3);
      
      return {
        x,
        y,
        vx: (dx / dist) * speed,
        vy: (dy / dist) * speed,
        size: Math.random() * 2 + 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 0.7 + Math.random() * 0.3,
        speed,
        trail: [],
      };
    };

    // Initialize particles
    const baseParticleCount = 60;
    particlesRef.current = Array.from({ length: baseParticleCount }, () => createParticle());

    let lastSpawnTime = 0;

    // Animation loop
    const animate = (timestamp: number) => {
      // Clear with slight fade for trail effect
      const fadeAmount = 0.15 + intensityRef.current * 0.1;
      ctx.fillStyle = `rgba(15, 10, 26, ${fadeAmount})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const particles = particlesRef.current;
      const currentIntensity = intensityRef.current;
      const currentSpeedMult = speedMultiplierRef.current;

      // Spawn extra particles when intensity is high
      const spawnInterval = Math.max(20, 100 - currentIntensity * 80); // 100ms to 20ms
      if (currentIntensity > 0 && timestamp - lastSpawnTime > spawnInterval) {
        const extraParticles = Math.ceil(currentIntensity * 5);
        for (let i = 0; i < extraParticles; i++) {
          const speed = (3 + Math.random() * 4) * currentSpeedMult;
          particles.push(createParticle(speed));
        }
        lastSpawnTime = timestamp;
      }

      // Draw center glow (brighter when intensity is high)
      const glowIntensity = 0.15 + currentIntensity * 0.3;
      const glowSize = 100 + currentIntensity * 50;
      const centerGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, glowSize);
      centerGradient.addColorStop(0, `rgba(249, 115, 22, ${glowIntensity})`);
      centerGradient.addColorStop(0.5, `rgba(139, 92, 246, ${glowIntensity * 0.5})`);
      centerGradient.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(centerX, centerY, glowSize, 0, Math.PI * 2);
      ctx.fillStyle = centerGradient;
      ctx.fill();

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];

        // Store trail position
        p.trail.push({ x: p.x, y: p.y });
        const maxTrailLength = 15 + Math.floor(currentIntensity * 10);
        if (p.trail.length > maxTrailLength) {
          p.trail.shift();
        }

        // Update position - apply speed multiplier
        const speedBoost = currentSpeedMult;
        p.x += p.vx * speedBoost;
        p.y += p.vy * speedBoost;

        // Calculate distance to center
        const dx = centerX - p.x;
        const dy = centerY - p.y;
        const distToCenter = Math.sqrt(dx * dx + dy * dy);

        // Fade as approaching center
        if (distToCenter < 150) {
          p.alpha = (distToCenter / 150) * 0.8;
        }

        // Reset particle when it reaches center or fades out
        if (distToCenter < 20 || p.alpha <= 0.05) {
          // Remove extra particles when intensity drops, keep base count
          if (particles.length > baseParticleCount && currentIntensity < 0.3) {
            particles.splice(i, 1);
          } else {
            const newSpeed = (2 + Math.random() * 3) * (currentIntensity > 0 ? currentSpeedMult : 1);
            Object.assign(p, createParticle(newSpeed));
          }
          continue;
        }

        // Draw trail
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
          trailGradient.addColorStop(1, p.color.replace(/[\d.]+\)$/, `${p.alpha * 0.6})`));
          
          ctx.strokeStyle = trailGradient;
          ctx.lineWidth = p.size * (1 + currentIntensity * 0.5);
          ctx.lineCap = 'round';
          ctx.stroke();
        }

        // Draw particle head (brighter)
        const headSize = p.size * (1.5 + currentIntensity * 0.5);
        ctx.beginPath();
        ctx.arc(p.x, p.y, headSize, 0, Math.PI * 2);
        ctx.fillStyle = p.color.replace(/[\d.]+\)$/, `${p.alpha})`);
        ctx.fill();

        // Draw glow around particle
        const glowRadius = p.size * (4 + currentIntensity * 2);
        const particleGlow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowRadius);
        particleGlow.addColorStop(0, p.color.replace(/[\d.]+\)$/, `${p.alpha * 0.4})`));
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
