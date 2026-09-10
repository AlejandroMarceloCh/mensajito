export type PaymentInput = {
  monthlyIncome: number;
  monthlyDebts?: number;
  downPayment?: number;
  termYears?: number;
  annualRate?: number;
};

export type PaymentEstimate = {
  netIncome: number;
  maxInstallment: number;
  estimatedLoan: number;
  estimatedPrice: number;
  assumptions: string;
};

const DEFAULT_RATE = 0.085;
const DEFAULT_TERM = 20;
const MAX_RATIO = 0.3;

export function estimatePaymentCapacity(input: PaymentInput): PaymentEstimate {
  const debts = Math.max(0, input.monthlyDebts ?? 0);
  const netIncome = Math.max(0, input.monthlyIncome - debts);
  const maxInstallment = roundMoney(netIncome * MAX_RATIO);
  const termYears = input.termYears ?? DEFAULT_TERM;
  const annualRate = input.annualRate ?? DEFAULT_RATE;
  const estimatedLoan = loanFromInstallment(maxInstallment, annualRate, termYears);
  const downPayment = Math.max(0, input.downPayment ?? 0);

  return {
    netIncome: roundMoney(netIncome),
    maxInstallment,
    estimatedLoan,
    estimatedPrice: roundMoney(estimatedLoan + downPayment),
    assumptions: `Cuota tope al 30% del ingreso neto, plazo ${termYears} años, tasa referencial ${(annualRate * 100).toFixed(1)}% anual. No es una oferta bancaria.`,
  };
}

function loanFromInstallment(
  installment: number,
  annualRate: number,
  termYears: number,
): number {
  if (installment <= 0) return 0;
  const monthlyRate = annualRate / 12;
  const n = termYears * 12;
  const factor = (1 - Math.pow(1 + monthlyRate, -n)) / monthlyRate;
  return roundMoney(installment * factor);
}

function roundMoney(value: number): number {
  return Math.round(value);
}
