export interface Point {
   x: number;
   y: number;
}

export function polarPoint(radius: number, angle: number): Point {
   return {
      x: Math.cos(angle - Math.PI / 2) * radius,
      y: Math.sin(angle - Math.PI / 2) * radius,
   };
}

export function chordLinePath(sourceAngle: number, targetAngle: number, radius: number): string {
   const source = polarPoint(radius, sourceAngle);
   const target = polarPoint(radius, targetAngle);

   return `M ${source.x.toFixed(2)} ${source.y.toFixed(2)} Q 0 0 ${target.x.toFixed(2)} ${target.y.toFixed(2)}`;
}
