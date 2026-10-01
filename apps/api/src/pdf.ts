import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { ApiError } from './ollama.ts';

export async function extractPdf(buffer: Buffer) {
  if (
    !Buffer.isBuffer(buffer) ||
    !buffer.length ||
    !buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'))
  ) {
    throw new ApiError('Please upload a valid PDF file.', 400);
  }

  const task = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    verbosity: 0,
  });

  try {
    const pdf = await task.promise;

    if (pdf.numPages > 100) {
      throw new ApiError('Maximum 100 pages allowed per PDF.', 413);
    }

    const pages: string[] = [];
    let characters = 0;

    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();

      const text = content.items
        .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
        .join('')
        .trim();

      characters += text.length + 2;

      if (characters > 200000) {
        throw new ApiError('PDF is too long. Split it into smaller files.', 413);
      }

      pages.push(text);
      page.cleanup();
    }

    const text = pages.join('\n\n').trim();

    if (!text) {
      throw new ApiError('No selectable text found. Scanned PDFs need OCR first.', 422);
    }

    return {
      text,
      pages: pdf.numPages,
      pageTexts: pages.map((text, index) => ({
        pageNumber: index + 1,
        text,
      })),
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;

    if (error instanceof Error && error.name === 'PasswordException') {
      throw new ApiError('This PDF is password-protected. Upload an unlocked copy.', 422);
    }

    throw new ApiError('Could not read this PDF. The file may be damaged.', 422);
  } finally {
    await task.destroy();
  }
}
