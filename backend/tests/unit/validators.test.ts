import { loginSchema, registerSchema } from '../../src/validators/auth';
import {
  bookingCreateSchema,
  budgetSchema,
  messageSchema,
  reviewSchema,
} from '../../src/validators/common';

describe('validators (Zod)', () => {
  describe('registerSchema', () => {
    const base = {
      name: 'Marina',
      email: 'MARINA@ZERO.DEV',
      password: 'Senha@123',
    };

    it('aceita payload mínimo', () => {
      const parsed = registerSchema.body.parse(base);
      expect(parsed.email).toBe('marina@zero.dev'); // normaliza
      expect(parsed.role).toBe('CLIENT');
    });

    it('rejeita e-mail inválido', () => {
      expect(() => registerSchema.body.parse({ ...base, email: 'invalid' })).toThrow();
    });

    it('rejeita senha muito curta', () => {
      expect(() => registerSchema.body.parse({ ...base, password: 'abc' })).toThrow();
    });

    it('rejeita nome curto', () => {
      expect(() => registerSchema.body.parse({ ...base, name: 'X' })).toThrow();
    });

    it('aceita telefone válido', () => {
      const parsed = registerSchema.body.parse({ ...base, phone: '+5511999998888' });
      expect(parsed.phone).toBe('+5511999998888');
    });

    it('rejeita telefone inválido', () => {
      expect(() => registerSchema.body.parse({ ...base, phone: 'abc' })).toThrow();
    });
  });

  describe('loginSchema', () => {
    it('exige email e senha', () => {
      expect(() => loginSchema.body.parse({ email: 'a@b.com' })).toThrow();
      expect(() => loginSchema.body.parse({ password: 'x' })).toThrow();
    });
  });

  describe('bookingCreateSchema', () => {
    const base = {
      providerId: '11111111-1111-1111-1111-111111111111',
      categoryId: 'plumb',
      title: 'Reparo',
      address: 'Rua A, 1',
    };

    it('aceita payload mínimo', () => {
      const parsed = bookingCreateSchema.body.parse(base);
      expect(parsed.urgency).toBe('FLEXIBLE');
    });

    it('rejeita providerId não-UUID', () => {
      expect(() => bookingCreateSchema.body.parse({ ...base, providerId: 'x' })).toThrow();
    });

    it('rejeita urgency inválida', () => {
      expect(() => bookingCreateSchema.body.parse({ ...base, urgency: 'ASAP' })).toThrow();
    });

    it('rejeita preço negativo', () => {
      expect(() => bookingCreateSchema.body.parse({ ...base, priceEstimate: -1 })).toThrow();
    });
  });

  describe('reviewSchema', () => {
    it('limita rating entre 1 e 5', () => {
      const bookingId = '11111111-1111-1111-1111-111111111111';
      expect(() => reviewSchema.body.parse({ bookingId, rating: 0 })).toThrow();
      expect(() => reviewSchema.body.parse({ bookingId, rating: 6 })).toThrow();
      const r = reviewSchema.body.parse({ bookingId, rating: 5 });
      expect(r.rating).toBe(5);
    });
  });

  describe('messageSchema', () => {
    it('rejeita mensagem vazia', () => {
      const receiverId = '11111111-1111-1111-1111-111111111111';
      expect(() => messageSchema.body.parse({ receiverId, content: '' })).toThrow();
    });

    it('aceita mensagem normal', () => {
      const receiverId = '11111111-1111-1111-1111-111111111111';
      const r = messageSchema.body.parse({ receiverId, content: 'Olá!' });
      expect(r.content).toBe('Olá!');
    });
  });

  describe('budgetSchema', () => {
    it('exige categoryId e answers', () => {
      expect(() => budgetSchema.body.parse({ answers: {} })).toThrow();
      expect(() => budgetSchema.body.parse({ categoryId: 'plumb' })).toThrow();
      const r = budgetSchema.body.parse({ categoryId: 'plumb', answers: { service: 'leak' } });
      expect(r.answers.service).toBe('leak');
    });
  });
});
