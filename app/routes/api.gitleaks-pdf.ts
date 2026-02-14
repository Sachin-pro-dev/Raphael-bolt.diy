import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { generateGitleaksPdf } from '~/lib/pdf-generator';

export async function action({ request }: ActionFunctionArgs) {
  try {
    const body = (await request.json()) as any;
    const { findings, stats, scanDuration } = body;

    if (!findings || !stats) {
      return new Response('Missing findings or stats', { status: 400 });
    }

    console.log('[GitLeaks PDF] Generating PDF report...');
    console.log('[GitLeaks PDF] Findings:', findings.length);
    console.log('[GitLeaks PDF] Stats:', stats);

    const pdfBuffer = await generateGitleaksPdf(findings, stats, scanDuration);

    console.log('[GitLeaks PDF] PDF generated successfully');
    console.log('[GitLeaks PDF] Size:', pdfBuffer.length, 'bytes');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `secrets-scan-report-${timestamp}.pdf`;

    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (error: any) {
    console.error('[GitLeaks PDF] Error generating PDF:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
