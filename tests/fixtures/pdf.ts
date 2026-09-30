// Minimal valid PDF with two pages, real xref offsets and selectable text.
export function pdfFixture(pages:string[]) {
  const objects:string[]=['<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const refs:number[]=[];
  for(const text of pages){
    const page=objects.length+1, stream=page+1;refs.push(page);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${stream} 0 R >>`);
    const content=`BT /F1 10 Tf 30 750 Td (${text.replace(/[\\()]/g,'\\$&')}) Tj ET`;
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  }
  objects[1]=`<< /Type /Pages /Count ${pages.length} /Kids [${refs.map(n=>`${n} 0 R`).join(' ')}] >>`;
  let result='%PDF-1.4\n';const offsets=[0];
  objects.forEach((obj,i)=>{offsets.push(Buffer.byteLength(result));result+=`${i+1} 0 obj\n${obj}\nendobj\n`;});
  const xref=Buffer.byteLength(result);
  result+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('');
  return Buffer.from(result+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
}
