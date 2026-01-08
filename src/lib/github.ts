// GitHub API utilities for updating the family tree data

const GITHUB_TOKEN = process.env.NEXT_PUBLIC_GITHUB_TOKEN || '';
const REPO_OWNER = process.env.NEXT_PUBLIC_GITHUB_OWNER || '';
const REPO_NAME = process.env.NEXT_PUBLIC_GITHUB_REPO || '';
const FILE_PATH = 'public/family-tree.json';

interface GitHubFileResponse {
  sha: string;
  content: string;
}

export async function getFileSha(): Promise<string | null> {
  if (!GITHUB_TOKEN || !REPO_OWNER || !REPO_NAME) {
    console.error('GitHub configuration missing');
    return null;
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`,
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get file: ${response.status}`);
    }

    const data: GitHubFileResponse = await response.json();
    return data.sha;
  } catch (error) {
    console.error('Error getting file SHA:', error);
    return null;
  }
}

export async function updateFamilyTreeData(data: object): Promise<boolean> {
  if (!GITHUB_TOKEN || !REPO_OWNER || !REPO_NAME) {
    console.error('GitHub configuration missing. Set NEXT_PUBLIC_GITHUB_TOKEN, NEXT_PUBLIC_GITHUB_OWNER, and NEXT_PUBLIC_GITHUB_REPO');
    return false;
  }

  try {
    // Get the current file SHA (required for updates)
    const sha = await getFileSha();
    if (!sha) {
      throw new Error('Could not get file SHA');
    }

    // Encode content to base64
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));

    // Update the file
    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Update family tree data - ${new Date().toISOString()}`,
          content: content,
          sha: sha,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to update file: ${error.message}`);
    }

    console.log('Family tree data saved to GitHub');
    return true;
  } catch (error) {
    console.error('Error updating family tree data:', error);
    return false;
  }
}

export function isGitHubConfigured(): boolean {
  return !!(GITHUB_TOKEN && REPO_OWNER && REPO_NAME);
}
