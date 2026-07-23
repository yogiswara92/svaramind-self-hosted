import JSZip from 'jszip';

export interface PPTSlide {
  title: string;
  content: string[];
}

export async function parsePPT(file: File): Promise<PPTSlide[]> {
  const zip = new JSZip();
  const zipContent = await zip.loadAsync(file);

  const slides: PPTSlide[] = [];

  // PPTX is a ZIP file with slides in ppt/slides/slide1.xml, slide2.xml, etc.
  const slideFiles = Object.keys(zipContent.files)
    .filter(name => name.match(/^ppt\/slides\/slide\d+\.xml$/))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] || '0');
      const numB = parseInt(b.match(/\d+/)?.[0] || '0');
      return numA - numB;
    });

  for (const slideFile of slideFiles) {
    try {
      const xml = await zipContent.files[slideFile].async('text');
      const slide = parseSlideXML(xml);
      if (slide) slides.push(slide);
    } catch (err) {
      console.error(`Error parsing ${slideFile}:`, err);
    }
  }

  return slides;
}

function parseSlideXML(xml: string): PPTSlide | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');

    if (doc.getElementsByTagName('parsererror').length > 0) {
      throw new Error('Invalid XML');
    }

    const content: string[] = [];
    const textLines = new Set<string>();

    // Extract all text elements (use getElementsByTagName for namespace-aware parsing)
    const textElements = doc.getElementsByTagName('a:t');

    for (let i = 0; i < textElements.length; i++) {
      const text = textElements[i].textContent?.trim();
      if (text && text.length > 0 && !textLines.has(text)) {
        textLines.add(text);
        content.push(text);
      }
    }

    // If no content found with namespace, try without namespace
    if (content.length === 0) {
      const fallbackTexts = doc.getElementsByTagName('t');
      for (let i = 0; i < fallbackTexts.length; i++) {
        const text = fallbackTexts[i].textContent?.trim();
        if (text && text.length > 0 && !textLines.has(text)) {
          textLines.add(text);
          content.push(text);
        }
      }
    }

    return {
      title: content[0] || 'Slide',
      content: content.length > 1 ? content.slice(1) : content
    };
  } catch (err) {
    console.error('Parse error:', err);
    return null;
  }
}

export function slidesToMarkdown(slides: PPTSlide[], filename?: string): string {
  let html = '';

  if (filename) {
    html += `<p>Imported from ${filename}</p><p></p>`;
  }

  html += slides
    .map((slide, idx) => {
      const slideNum = idx + 1;
      const title = slide.title || 'Untitled';
      const contentLines = slide.content.filter(line => line.length > 0);

      let slideHtml = `<p><strong>Slide ${slideNum}: ${title}</strong></p>`;

      if (contentLines.length > 0) {
        slideHtml += '<ul>';
        slideHtml += contentLines.map(line => `<li>${line}</li>`).join('');
        slideHtml += '</ul>';
      } else {
        slideHtml += '<p>(no content)</p>';
      }

      slideHtml += '<p></p>';
      return slideHtml;
    })
    .join('');

  return html;
}
