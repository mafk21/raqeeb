#!/usr/bin/env python3
"""Run a terminal agent inside Raqeeb's answer wrapper. Standard library only.

  raqeeb wrap aider [aider arguments]

The agent runs in a pseudo-terminal that you see and type in as normal. When its output ends in a
confirmation prompt (Aider's "(Y)es/(N)o ... [Yes]:"), the wrapper shows it on the Raqeeb dashboard.
If you click an option there, the wrapper types that key for you. If you type in the terminal first,
or Raqeeb is not running or nobody is watching, the prompt is left entirely to you.
"""
import os, sys, re, json, pty, select, signal, struct, fcntl, termios, tty, threading, http.client, time

PROFILES = {
    # Aider io.py confirm_ask: "<question> (Y)es/(N)o[/(A)ll][/(S)kip all][/(D)on't ask again] [Yes]:"
    'aider': re.compile(r"(?P<q>[^\n]*?)\s*(?P<opts>\(Y\)es/\(N\)o[^\n\[]*)\[(?:Yes|No)\]:\s*$"),
}
OPT_NAMES = {'y': 'Yes', 'n': 'No', 'a': 'Yes to all', 's': 'Skip all', 'd': "Don't ask again"}
ANSI = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][A-Z0-9]|\r")

def config():
    home = os.environ.get('RAQEEB_HOME') or os.path.join(os.path.expanduser('~'), '.raqeeb')
    try:
        with open(os.path.join(home, 'hook.json')) as f: return json.load(f)
    except Exception: return None

def parse_prompt(text, profile):
    """Return (question, subject, options) if the cleaned output ends in a confirmation prompt."""
    tail = text[-1500:]
    m = PROFILES[profile].search(tail)
    if not m: return None
    opts = [(k.lower(), OPT_NAMES.get(k.lower(), k)) for k in re.findall(r"\(([YNASD])\)", m.group('opts'))]
    before = tail[:m.start()].rstrip('\n')
    lines = [l for l in before.split('\n') if l.strip()]
    subject = '\n'.join(lines[-3:])
    return m.group('q').strip() or 'Confirm', subject.strip(), opts

class Ask(threading.Thread):
    """Posts one prompt to the dashboard and waits for a click. Cancelled by closing the connection."""
    def __init__(self, cfg, tool, payload, wait, done):
        super().__init__(daemon=True); self.cfg, self.tool, self.payload, self.wait, self.done = cfg, tool, payload, wait, done; self.conn = None; self.cancelled = False
    def run(self):
        decision, reason = None, None
        try:
            body = json.dumps({'tool': self.tool, 'wait': self.wait, 'payload': self.payload})
            self.conn = http.client.HTTPConnection('127.0.0.1', self.cfg['port'], timeout=self.wait + 10)
            self.conn.request('POST', '/api/hook/request', body, {'Content-Type': 'application/json', 'X-Raqeeb-Token': self.cfg['token']})
            r = self.conn.getresponse()
            if r.status == 200:
                j = json.loads(r.read() or b'{}') or {}; decision, reason = j.get('decision'), j.get('reason')
        except Exception: pass
        if not self.cancelled: self.done(decision, reason)
    def cancel(self):
        self.cancelled = True
        try:
            if self.conn and self.conn.sock: self.conn.sock.close()
        except Exception: pass

def main():
    args = sys.argv[1:]
    if not args or args[0] not in PROFILES:
        sys.stderr.write('Usage: raqeeb wrap aider [aider arguments]\n'); return 2
    profile, cmd = args[0], args
    cfg = config()
    if not cfg:
        sys.stderr.write('Raqeeb is not running, so the wrapper has nothing to ask. Starting %s normally.\n' % profile); os.execvp(cmd[0], cmd)
    pid, master = pty.fork()
    if pid == 0:
        os.execvp(cmd[0], cmd)
    def size():
        try:
            s = fcntl.ioctl(sys.stdout.fileno(), termios.TIOCGWINSZ, b'\0' * 8); fcntl.ioctl(master, termios.TIOCSWINSZ, s)
        except Exception: pass
    size(); signal.signal(signal.SIGWINCH, lambda *a: size())
    interactive = sys.stdin.isatty(); old = None
    if interactive: old = termios.tcgetattr(sys.stdin.fileno()); tty.setraw(sys.stdin.fileno())
    buf, last_out, ask, asked_for = '', 0.0, None, None
    lock = threading.Lock(); pending = []
    retry = [0.0]
    def answered(decision, reason=None):
        if reason == 'no-viewer': retry[0] = time.time() + 3  # nobody watching the dashboard yet: look again shortly
        if isinstance(decision, dict) and isinstance(decision.get('text'), str) and len(decision['text']) == 1:
            pending.append(decision['text'])
    status = 0
    try:
        while True:
            r, _, _ = select.select([master] + ([sys.stdin] if interactive or True else []), [], [], 0.15)
            if master in r:
                try: data = os.read(master, 65536)
                except OSError: data = b''
                if not data: break
                os.write(sys.stdout.fileno(), data); last_out = time.time()
                buf = (buf + ANSI.sub('', data.decode('utf-8', 'replace')))[-4000:]
                if ask: ask.cancel(); ask = None; asked_for = None  # the agent moved on
            if sys.stdin in r:
                d = os.read(sys.stdin.fileno(), 4096)
                if not d: break
                os.write(master, d)
                if ask: ask.cancel(); ask = None  # you answered in the terminal
                asked_for = buf[-300:]
            while pending:
                os.write(master, (pending.pop(0) + '\r').encode())
            if retry[0] and time.time() > retry[0]: retry[0] = 0.0; asked_for = None; ask = None
            if not ask and buf and time.time() - last_out > 0.4 and buf[-300:] != asked_for:
                p = parse_prompt(buf, profile)
                if p:
                    q, subject, opts = p; asked_for = buf[-300:]
                    ask = Ask(cfg, profile, {'session_id': str(pid), 'cwd': os.getcwd(), 'tool_name': 'confirm', 'prompt': {'question': q, 'subject': subject, 'options': [{'key': k, 'label': l} for k, l in opts]}}, 110, answered); ask.start()
    finally:
        if old: termios.tcsetattr(sys.stdin.fileno(), termios.TCSADRAIN, old)
    try: _, st = os.waitpid(pid, 0); status = os.waitstatus_to_exitcode(st)
    except Exception: pass
    return status if status >= 0 else 1

if __name__ == '__main__':
    sys.exit(main())
