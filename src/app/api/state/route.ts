import { NextResponse } from 'next/server';
import { currentWorkspace, stateForWorkspace } from '../../../lib/api.ts';

export async function GET() {
  try {
    const workspace = await currentWorkspace();
    return NextResponse.json(await stateForWorkspace(workspace.id, workspace.db));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'State unavailable' }, { status: 500 });
  }
}
