'use client';

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  Circle,
  Terminal,
  Copy,
  Check,
  ArrowLeft,
  ArrowRight,
  Server,
  Shield,
  Play,
  Zap,
  PartyPopper,
  Upload,
  Package,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface MT5SetupWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: (bridgeUrl: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type StepStatus = 'pending' | 'done';

interface WizardStep {
  id: number;
  title: string;
  icon: React.ReactNode;
  description: string;
  codeBlocks: { label: string; code: string }[];
}

/* ------------------------------------------------------------------ */
/*  Step definitions                                                   */
/* ------------------------------------------------------------------ */

const STEPS: WizardStep[] = [
  {
    id: 1,
    title: 'Connect to Your VPS',
    icon: <Server className="w-5 h-5" />,
    description:
      'Think of your VPS like a computer far away that runs MetaTrader 5 all day and night. You need to "phone" it from your computer first! Open your terminal (that black box 🖥️) and type:',
    codeBlocks: [
      { label: 'Open Terminal', code: 'ssh root@YOUR_VPS_IP' },
    ],
  },
  {
    id: 2,
    title: 'Install Python',
    icon: <Terminal className="w-5 h-5" />,
    description:
      'Python is like a magical language that our bridge program speaks. Let\'s make sure it\'s installed on your VPS! First, check if it\'s already there:',
    codeBlocks: [
      { label: 'Check if Python exists', code: 'python3 --version' },
      {
        label: 'If not found — install it',
        code: 'sudo apt update && sudo apt install -y python3 python3-pip',
      },
    ],
  },
  {
    id: 3,
    title: 'Upload Bridge Files',
    icon: <Upload className="w-5 h-5" />,
    description:
      'Now we need to send the "bridge" program from your computer to the VPS. Imagine handing a letter to a friend — we use SCP ("Secure Copy") to send the files:',
    codeBlocks: [
      {
        label: 'Copy bridge files to VPS',
        code: 'scp -r ./vps-bridge/ root@YOUR_VPS_IP:/opt/mt5-bridge/',
      },
    ],
  },
  {
    id: 4,
    title: 'Install Dependencies',
    icon: <Package className="w-5 h-5" />,
    description:
      'The bridge needs some helper tools (like ingredients for a recipe 🍰) to work. Let\'s install them all at once. Run this on your VPS:',
    codeBlocks: [
      { label: 'Install all required packages', code: 'cd /opt/mt5-bridge && pip3 install -r requirements.txt' },
    ],
  },
  {
    id: 5,
    title: 'Open Firewall Port',
    icon: <Shield className="w-5 h-5" />,
    description:
      'Your VPS has a security guard (firewall 🧱) that blocks strangers. We need to tell it to let our dashboard talk to the bridge on port 8080:',
    codeBlocks: [
      { label: 'Allow port 8080 through the firewall', code: 'sudo ufw allow 8080/tcp' },
    ],
  },
  {
    id: 6,
    title: 'Start the Bridge!',
    icon: <Play className="w-5 h-5" />,
    description:
      'This is the exciting part! 🚀 We\'re turning on the bridge so it starts talking to MetaTrader 5. Run this command on your VPS:',
    codeBlocks: [
      {
        label: 'Launch the bridge server',
        code: 'cd /opt/mt5-bridge && python3 server.py --port 8080 --host 0.0.0.0',
      },
    ],
  },
  {
    id: 7,
    title: 'Make It Permanent',
    icon: <Zap className="w-5 h-5" />,
    description:
      'Right now the bridge stops if you turn off your VPS. Let\'s make it start automatically every time the VPS turns on — like setting an alarm clock ⏰! Create a service file:',
    codeBlocks: [
      {
        label: 'Create the service file',
        code: 'sudo tee /etc/systemd/system/mt5-bridge.service << EOF\n[Unit]\nDescription=MT5 Bridge Server\nAfter=network.target\n\n[Service]\nType=simple\nUser=root\nWorkingDirectory=/opt/mt5-bridge\nExecStart=/usr/bin/python3 server.py --port 8080 --host 0.0.0.0\nRestart=always\nRestartSec=5\n\n[Install]\nWantedBy=multi-user.target\nEOF',
      },
      {
        label: 'Enable and start the service',
        code: 'sudo systemctl daemon-reload && sudo systemctl enable mt5-bridge && sudo systemctl start mt5-bridge',
      },
    ],
  },
  {
    id: 8,
    title: 'Connect Dashboard',
    icon: <PartyPopper className="w-5 h-5" />,
    description:
      'Almost done! Now let\'s link your dashboard to the bridge. Enter your Cloudflare Tunnel URL (from Step 7) or your VPS IP + port below and we\'ll test the connection. If it works — you\'re live! 🎉',
    codeBlocks: [
      {
        label: 'If using Cloudflare Tunnel — paste the URL shown in Step 7',
        code: 'https://electric-varies-cube-acquisitions.trycloudflare.com',
      },
    ],
  },
];

const TOTAL_STEPS = STEPS.length;

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

/** A single copyable code block */
function CodeBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for environments where clipboard API isn't available
      const textarea = document.createElement('textarea');
      textarea.value = code;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [code]);

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-muted-foreground font-medium">{label}</p>
      <div className="group relative rounded-md bg-zinc-900 border border-zinc-800 overflow-hidden">
        {/* Code content */}
        <pre className="p-3 pr-12 text-xs sm:text-sm font-mono text-emerald-400 overflow-x-auto whitespace-pre leading-relaxed">
          {code}
        </pre>
        {/* Copy button */}
        <button
          onClick={handleCopy}
          className={cn(
            'absolute top-2 right-2 p-1.5 rounded-md transition-all duration-200',
            copied
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700'
          )}
          title={copied ? 'Copied!' : 'Copy to clipboard'}
        >
          {copied ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}

/** The step indicator circle used in the progress bar */
function StepDot({
  step,
  status,
  isCurrent,
}: {
  step: number;
  status: StepStatus;
  isCurrent: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={cn(
          'flex items-center justify-center rounded-full transition-all duration-300',
          status === 'done' && 'bg-emerald-500 text-white',
          isCurrent && status !== 'done' && 'bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-1 ring-offset-background',
          !isCurrent && status !== 'done' && 'bg-muted text-muted-foreground'
        )}
      >
        {status === 'done' ? (
          <CheckCircle2 className="w-5 h-5" />
        ) : (
          <Circle className="w-5 h-5" />
        )}
      </div>
      <span
        className={cn(
          'text-[10px] font-medium hidden sm:block transition-colors',
          isCurrent ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        {step}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function MT5SetupWizard({
  open,
  onOpenChange,
  onComplete,
}: MT5SetupWizardProps) {
  /* ---- State ---- */
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [vpsIp, setVpsIp] = useState('');
  const [vpsPort, setVpsPort] = useState('8080');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  const activeStep = STEPS[currentStep];
  const isLastStep = currentStep === TOTAL_STEPS - 1;
  const allDone = completedSteps.size === TOTAL_STEPS;
  const progressValue = ((currentStep + 1) / TOTAL_STEPS) * 100;

  /* ---- Handlers ---- */

  const markDone = useCallback((stepId: number) => {
    setCompletedSteps(prev => {
      const next = new Set(prev);
      next.add(stepId);
      return next;
    });
  }, []);

  const goNext = useCallback(() => {
    markDone(activeStep.id);
    if (currentStep < TOTAL_STEPS - 1) {
      setCurrentStep(prev => prev + 1);
    }
  }, [currentStep, activeStep, markDone]);

  const goPrev = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  const skipStep = useCallback(() => {
    if (currentStep < TOTAL_STEPS - 1) {
      setCurrentStep(prev => prev + 1);
    }
  }, [currentStep]);

  const handleTestConnection = useCallback(async () => {
    if (!vpsIp.trim()) return;

    setTesting(true);
    setTestResult('idle');
    setTestMessage('');

    try {
      // Detect if input is a full URL (https://...) or IP:Port
      const input = vpsIp.trim();
      let bridgeUrl: string;
      if (input.startsWith('http://') || input.startsWith('https://')) {
        bridgeUrl = input.replace(/\/+$/, ''); // strip trailing slashes
      } else if (input.includes(':')) {
        // e.g. "192.168.1.100:8080"
        bridgeUrl = `http://${input}`;
      } else {
        // Bare IP — use default port
        bridgeUrl = `http://${input}:${vpsPort.trim()}`;
      }

      const res = await fetch('/api/forex/mt5/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: bridgeUrl, test: true }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setTestResult('success');
        setTestMessage('Connection successful! Your MT5 bridge is live 🎉');
        markDone(8);
        onComplete?.(bridgeUrl);
      } else {
        setTestResult('error');
        setTestMessage(data.error || 'Could not reach the bridge. Check your URL.');
      }
    } catch {
      setTestResult('error');
      setTestMessage('Network error. Make sure the bridge is running on your VPS.');
    } finally {
      setTesting(false);
    }
  }, [vpsIp, vpsPort, onComplete, markDone]);

  /* When dialog opens, reset to step 0 */
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        // Reset state on close
        setCurrentStep(0);
        setCompletedSteps(new Set());
        setVpsIp('');
        setVpsPort('8080');
        setTestResult('idle');
        setTestMessage('');
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange]
  );

  /* ---- Render ---- */

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto p-0">
        {/* Header */}
        <div className="bg-gradient-to-r from-zinc-900 to-zinc-800 px-6 pt-6 pb-4 rounded-t-lg">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2 text-white">
              <Server className="w-5 h-5 text-emerald-400" />
              MT5 Setup Wizard
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm mt-1">
              Follow these steps to connect your VPS running MetaTrader 5 to the dashboard.
              We&apos;ll go through it together — nice and easy! 🌟
            </DialogDescription>
          </DialogHeader>

          {/* Progress bar */}
          <div className="mt-4">
            <Progress
              value={progressValue}
              className="h-2 bg-zinc-700 [&>[data-slot=progress-indicator]]:bg-emerald-500"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[11px] text-zinc-400">
                Step {currentStep + 1} of {TOTAL_STEPS}
              </span>
              <span className="text-[11px] text-zinc-400">
                {completedSteps.size} / {TOTAL_STEPS} completed
              </span>
            </div>
          </div>

          {/* Step dots */}
          <div className="flex items-center justify-between mt-3 px-2">
            {STEPS.map((step, idx) => (
              <React.Fragment key={step.id}>
                <StepDot
                  step={step.id}
                  status={completedSteps.has(step.id) ? 'done' : 'pending'}
                  isCurrent={idx === currentStep}
                />
                {idx < TOTAL_STEPS - 1 && (
                  <div
                    className={cn(
                      'flex-1 h-px mx-1 transition-colors',
                      completedSteps.has(step.id) ? 'bg-emerald-500/50' : 'bg-zinc-700'
                    )}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="px-6 py-5 space-y-4">
          {/* Step title + icon */}
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'flex items-center justify-center w-10 h-10 rounded-lg shrink-0 transition-colors',
                completedSteps.has(activeStep.id)
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-primary/15 text-primary'
              )}
            >
              {completedSteps.has(activeStep.id) ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                activeStep.icon
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                Step {activeStep.id}: {activeStep.title}
                {completedSteps.has(activeStep.id) && (
                  <Badge
                    variant="outline"
                    className="text-[10px] border-emerald-500/30 text-emerald-500 bg-emerald-500/10"
                  >
                    Done
                  </Badge>
                )}
              </h3>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                {activeStep.description}
              </p>
            </div>
          </div>

          {/* Code blocks */}
          {activeStep.codeBlocks.length > 0 && (
            <div className="space-y-3">
              {activeStep.codeBlocks.map((block, idx) => (
                <CodeBlock key={idx} label={block.label} code={block.code} />
              ))}
            </div>
          )}

          {/* Step 8 — Connection test UI */}
          {isLastStep && (
            <div className="space-y-4 mt-2">
              {/* Tunnel URL input */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">
                  Bridge URL (Cloudflare Tunnel or IP:Port)
                </label>
                <Input
                  placeholder="https://your-tunnel.trycloudflare.com  or  http://192.168.1.100:8080"
                  value={vpsIp}
                  onChange={e => {
                    setVpsIp(e.target.value);
                    setTestResult('idle');
                    setTestMessage('');
                  }}
                  className="font-mono text-sm"
                />
              </div>

              <Button
                onClick={handleTestConnection}
                disabled={testing || !vpsIp.trim()}
                className={cn(
                  'w-full sm:w-auto transition-all',
                  testResult === 'success' &&
                    'bg-emerald-600 hover:bg-emerald-600 text-white'
                )}
              >
                {testing ? (
                  <>
                    <span className="animate-spin mr-1">&#9696;</span>
                    Testing Connection...
                  </>
                ) : testResult === 'success' ? (
                  <>
                    <PartyPopper className="w-4 h-4 mr-1" />
                    Connected!
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-1" />
                    Test Connection
                  </>
                )}
              </Button>

              {/* Feedback messages */}
              {testResult !== 'idle' && testMessage && (
                <div
                  className={cn(
                    'rounded-lg p-3 text-sm flex items-start gap-2',
                    testResult === 'success'
                      ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                      : 'bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400'
                  )}
                >
                  {testResult === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 mt-0.5 shrink-0" />
                  )}
                  <span>{testMessage}</span>
                </div>
              )}

              {/* Celebration state */}
              {testResult === 'success' && (
                <div className="text-center py-4 space-y-2">
                  <div className="text-4xl">🎉</div>
                  <p className="text-sm font-medium text-foreground">
                    You&apos;re all set! Your dashboard is now connected to MT5.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Live market data will stream automatically. Happy trading! 📈
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer navigation */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/30 rounded-b-lg">
          <Button
            variant="ghost"
            size="sm"
            onClick={goPrev}
            disabled={currentStep === 0}
            className="text-muted-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Previous
          </Button>

          <div className="flex items-center gap-2">
            {!isLastStep && (
              <Button
                variant="ghost"
                size="sm"
                onClick={skipStep}
                className="text-muted-foreground text-xs"
              >
                Skip
              </Button>
            )}
            {!isLastStep && (
              <Button size="sm" onClick={goNext} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                Next
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
