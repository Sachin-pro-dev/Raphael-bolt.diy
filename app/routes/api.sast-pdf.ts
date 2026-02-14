import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { generateSastPdf } from '~/lib/pdf-generator';

export async function action({ request }: ActionFunctionArgs) {
  try {
    const body = (await request.json()) as any;
    const { findings, stats } = body;

    if (!findings || !stats) {
      return new Response('Missing findings or stats', { status: 400 });
    }

    console.log('[SAST PDF] Generating PDF report...');
    console.log('[SAST PDF] Findings:', findings.length);
    console.log('[SAST PDF] Stats:', stats);

    const pdfBuffer = await generateSastPdf(findings, stats);

    console.log('[SAST PDF] PDF generated successfully');
    console.log('[SAST PDF] Size:', pdfBuffer.length, 'bytes');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `sast-report-${timestamp}.pdf`;

    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (error: any) {
    console.error('[SAST PDF] Error generating PDF:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
