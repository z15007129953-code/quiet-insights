import { NextResponse } from 'next/server';
import { currentWorkspace } from '../../../lib/api.ts';
import { applicationForWorkspace, exportRows } from '../../../lib/repository.ts';
import { csv, parseDays, parseEnvironment } from '../../../lib/domain.ts';

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const workspace = await currentWorkspace();
    const appId = query.get('appId');
    if (!appId) throw new Error('appId is required');
    if (!await applicationForWorkspace(workspace.id, appId, workspace.db)) throw new Error('Application not found');
    const rows = await exportRows({ appId, environment: parseEnvironment(query.get('environment')), days: parseDays(query.get('days')), version: query.get('version') || undefined, propertyKey: query.get('propertyKey') || undefined, propertyValue: query.get('propertyValue') || undefined }, workspace.db);
    return new NextResponse(csv(rows), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="quiet-insights-export.csv"' } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Export unavailable' }, { status: 400 }); }
}
