import { handleInstagramRequest } from '../../../../lib/instagram-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return handleInstagramRequest(request);
}

export function POST(request: Request) {
  return handleInstagramRequest(request);
}
