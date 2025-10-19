import { supabase } from '../services/supabaseClient';
import { decode } from 'base64-arraybuffer';


export async function uploadPhotoAsync(uri: string, fileName: string, companyId: string, collaboratorId: string) {
  try {
    const response = await fetch(uri);
    console.log('Photo fetch response:', response);
    const arrayBuffer = await response.arrayBuffer();
    const fileExt = fileName.split('.').pop();
    const path = `${companyId}/collaborators/${collaboratorId}/attendance-photos/${fileName}`;

    const { error } = await supabase.storage
      .from('companies')
      .upload(path, arrayBuffer, {
        contentType: `image/${fileExt}`,
        upsert: true,
      });

    if (error) {
      console.log('Supabase upload error:', error);
      throw error;
    }

    const { data } = supabase.storage
      .from('companies')
      .getPublicUrl(path);
    return data.publicUrl;
  } catch (e) {
    console.log('uploadPhotoAsync error:', e);
    throw e;
  }
}
