import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { generateDastPdf } from '~/lib/pdf-generator';

export async function action({ request }: ActionFunctionArgs) {
  try {
    const body = (await request.json()) as any;
    const { alerts, stats, targetUrl, scanDuration } = body;

    if (!alerts || !stats || !targetUrl) {
      return new Response('Missing required data', { status: 400 });
    }

    console.log('[DAST PDF] Generating PDF report...');
    console.log('[DAST PDF] Alerts:', alerts.length);
    console.log('[DAST PDF] Stats:', stats);
    console.log('[DAST PDF] Target:', targetUrl);

    const pdfBuffer = await generateDastPdf(alerts, stats, targetUrl, scanDuration || 0);

    console.log('[DAST PDF] PDF generated successfully');
    console.log('[DAST PDF] Size:', pdfBuffer.length, 'bytes');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `dast-report-${timestamp}.pdf`;

    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (error: any) {
    console.error('[DAST PDF] Error generating PDF:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
