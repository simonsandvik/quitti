export async function htmlToPdfBlob(html: string): Promise<Blob> {
    // Dynamic import to avoid SSR 'self is not defined' error
    const html2pdf = (await import('html2pdf.js')).default;

    const element = document.createElement('div');
    // Render off-screen but in DOM so html2canvas can 'see' styles/images
    element.style.position = 'fixed';
    element.style.left = '-9999px';
    element.style.top = '0';
    element.style.width = '800px';
    element.style.backgroundColor = '#ffffff';

    element.innerHTML = html;
    element.style.padding = '40px';
    element.style.fontFamily = 'sans-serif';
    element.style.color = '#333';

    // Optional: add a branding header
    const header = document.createElement('div');
    header.innerHTML = '<div style="border-bottom: 2px solid #eee; padding-bottom: 10px; margin-bottom: 20px;"><strong style="color: #6366f1;">Quitti</strong> - Automated Export</div>';
    element.prepend(header);

    document.body.appendChild(element);

    // Wait for images if any
    await new Promise(resolve => setTimeout(resolve, 500));

    const options = {
        margin: 10 as number,
        filename: 'receipt.pdf',
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: {
            scale: 2,
            useCORS: true
        },
        jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const }
    };

    try {
        const blob = await html2pdf().from(element).set(options).output('blob');
        document.body.removeChild(element);
        return blob;
    } catch (e) {
        if (document.body.contains(element)) document.body.removeChild(element);
        throw e;
    }
}
