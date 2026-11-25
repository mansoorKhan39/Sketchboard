// A minimal PDF writer: one page that holds one JPEG picture. (Enough for "export the board as a PDF", with no library.)
const enc = (s: string) => new TextEncoder().encode(s);

export function jpegToPdf(jpeg: Uint8Array, widthPx: number, heightPx: number): Uint8Array {
  // PDF units are points (1/72 inch). Keep the page at the picture's size, but never above the 14400 point limit.
  const k = Math.min(1, 14400 / Math.max(widthPx, heightPx));
  const w = Math.max(1, Math.round(widthPx * k)), h = Math.max(1, Math.round(heightPx * k));
  const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (b: Uint8Array) => {
    chunks.push(b);
    length += b.length;
  };
  const obj = (n: number, ...body: Uint8Array[]) => {
    offsets[n] = length;
    push(enc(`${n} 0 obj\n`));
    body.forEach(push);
    push(enc("\nendobj\n"));
  };
  push(enc("%PDF-1.4\n"));
  obj(1, enc("<< /Type /Catalog /Pages 2 0 R >>"));
  obj(2, enc("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"));
  obj(3, enc(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
  obj(4, enc(`<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`), jpeg, enc("\nendstream"));
  obj(5, enc(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
  const xref = length;
  let table = `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i++) table += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  push(enc(table + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
