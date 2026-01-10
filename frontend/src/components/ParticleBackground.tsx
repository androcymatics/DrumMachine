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

export function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationRef = useRef<number>();

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
    const createParticle = (): Particle => {
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
      const speed = 2 + Math.random() * 3;
      
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
    const particleCount = 60;
    particlesRef.current = Array.from({ length: particleCount }, () => createParticle());

    // Animation loop
    const animate = () => {
      // Clear with slight fade for trail effect
      ctx.fillStyle = 'rgba(15, 10, 26, 0.15)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const particles = particlesRef.current;

      // Draw center glow
      const centerGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 100);
      centerGradient.addColorStop(0, 'rgba(249, 115, 22, 0.15)');
      centerGradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.08)');
      centerGradient.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(centerX, centerY, 100, 0, Math.PI * 2);
      ctx.fillStyle = centerGradient;
      ctx.fill();

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];

        // Store trail position
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 15) {
          p.trail.shift();
        }

        // Update position - straight line to center
        p.x += p.vx;
        p.y += p.vy;

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
          Object.assign(p, createParticle());
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
          ctx.lineWidth = p.size;
          ctx.lineCap = 'round';
          ctx.stroke();
        }

        // Draw particle head (brighter)
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = p.color.replace(/[\d.]+\)$/, `${p.alpha})`);
        ctx.fill();

        // Draw glow around particle
        const glowGradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4);
        glowGradient.addColorStop(0, p.color.replace(/[\d.]+\)$/, `${p.alpha * 0.4})`));
        glowGradient.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2);
        ctx.fillStyle = glowGradient;
        ctx.fill();
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    // Start animation
    animate();

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
