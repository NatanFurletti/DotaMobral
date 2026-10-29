// Saída de áudio no Windows, sem dependências:
//  - say(texto): voz sintetizada (System.Speech)
//  - play(arquivo): toca .wav ou .mp3 (winmm / MCI)
// Mantém um único processo PowerShell aberto; tudo toca em fila, um depois do outro.
import { spawn } from 'node:child_process';

export function createSpeaker({ voice = 'pt-BR', rate = 0, volume = 100, soundVolume = volume, mute = false } = {}) {
  if (mute || process.platform !== 'win32') {
    return {
      say: (text) => console.log(`🔊 ${text}`),
      play: (file) => console.log(`🎵 ${file}`),
      close() {},
    };
  }

  const mciVolume = Math.round(Math.min(Math.max(Number(soundVolume), 0), 100) * 10); // 0..1000
  const script = `
    [Console]::InputEncoding = [Text.Encoding]::UTF8
    Add-Type -AssemblyName System.Speech
    Add-Type -Namespace Win -Name Mci -MemberDefinition '[DllImport("winmm.dll", CharSet = CharSet.Unicode)] public static extern int mciSendString(string cmd, System.Text.StringBuilder ret, int len, System.IntPtr cb);'
    $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $v = $s.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq '${voice}' } | Select-Object -First 1
    if ($v) { $s.SelectVoice($v.VoiceInfo.Name) }
    $s.Rate = ${Number(rate)}
    $s.Volume = ${Number(volume)}
    function Play-File($path) {
      [Win.Mci]::mciSendString('close snd', $null, 0, [IntPtr]::Zero) | Out-Null
      $err = [Win.Mci]::mciSendString(('open "' + $path + '" type mpegvideo alias snd'), $null, 0, [IntPtr]::Zero)
      if ($err -ne 0) { [Console]::Error.WriteLine("Nao consegui tocar: $path (erro MCI $err)"); return }
      [Win.Mci]::mciSendString('setaudio snd volume to ${mciVolume}', $null, 0, [IntPtr]::Zero) | Out-Null
      [Win.Mci]::mciSendString('play snd wait', $null, 0, [IntPtr]::Zero) | Out-Null
      [Win.Mci]::mciSendString('close snd', $null, 0, [IntPtr]::Zero) | Out-Null
    }
    while (($line = [Console]::In.ReadLine()) -ne $null) {
      if ($line.StartsWith('PLAY:')) { Play-File $line.Substring(5) }
      elseif ($line.StartsWith('SAY:')) { $s.Speak($line.Substring(4)) }
    }
  `;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
    stdio: ['pipe', 'ignore', 'inherit'],
    windowsHide: true,
  });
  child.on('error', (err) => console.error('Erro ao iniciar o áudio:', err.message));

  const send = (line) => {
    if (child.stdin.writable) child.stdin.write(`${line.replace(/\r?\n/g, ' ')}\n`, 'utf8');
  };

  return {
    say(text) {
      console.log(`🔊 ${text}`);
      send(`SAY:${text}`);
    },
    play(file) {
      console.log(`🎵 ${file}`);
      send(`PLAY:${file}`);
    },
    close() {
      child.stdin.end();
    },
  };
}
