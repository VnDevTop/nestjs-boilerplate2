import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { DeviceAuthorizationService } from './device-authorization.service.js';
import {
  DeviceAuthorization,
  DeviceAuthorizationStatus,
} from './entities/device-authorization.entity.js';

describe('DeviceAuthorizationService', () => {
  let service: DeviceAuthorizationService;
  let deviceRepository: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  const mockDevice = {
    id: 'device-auth-1',
    deviceCode: 'device-code-1',
    userCode: 'ABCD-EFGH',
    clientId: 'nestjs-device-client',
    userId: null,
    status: DeviceAuthorizationStatus.PENDING,
    scopes: null,
    expiresAt: new Date(Date.now() + 60 * 1000),
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
  } as DeviceAuthorization;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceAuthorizationService,
        {
          provide: getRepositoryToken(DeviceAuthorization),
          useValue: {
            create: vi.fn(),
            save: vi.fn(),
            findOne: vi.fn(),
            delete: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DeviceAuthorizationService>(
      DeviceAuthorizationService,
    );
    deviceRepository = module.get(
      getRepositoryToken(DeviceAuthorization),
    ) as any;
  });

  describe('generateDeviceCode', () => {
    it('should generate a high entropy opaque device code', () => {
      const code = service.generateDeviceCode();

      expect(code).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('generateUserCode', () => {
    it('should generate a user facing device code in XXXX-XXXX format', () => {
      const code = service.generateUserCode();

      expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    });
  });

  describe('createAuthorization', () => {
    it('should create a pending device authorization', async () => {
      vi.mocked(deviceRepository.create).mockReturnValue(mockDevice);
      vi.mocked(deviceRepository.save).mockResolvedValue(mockDevice);

      const result = await service.createAuthorization('nestjs-device-client', [
        'openid',
      ]);

      expect(deviceRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceCode: expect.any(String),
          userCode: expect.any(String),
          clientId: 'nestjs-device-client',
          userId: null,
          status: DeviceAuthorizationStatus.PENDING,
          scopes: ['openid'],
          expiresAt: expect.any(Date),
        }),
      );
      expect(deviceRepository.save).toHaveBeenCalled();
      expect(result).toEqual(mockDevice);
    });

    it('should default scopes to null when none are provided', async () => {
      vi.mocked(deviceRepository.create).mockReturnValue(mockDevice);
      vi.mocked(deviceRepository.save).mockResolvedValue(mockDevice);

      await service.createAuthorization('nestjs-device-client');

      expect(deviceRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ scopes: null }),
      );
    });
  });

  describe('findByDeviceCode', () => {
    it('should return the device authorization when it is not expired', async () => {
      vi.mocked(deviceRepository.findOne).mockResolvedValue(mockDevice);

      const result = await service.findByDeviceCode('device-code-1');

      expect(result).toEqual(mockDevice);
      expect(deviceRepository.save).not.toHaveBeenCalled();
    });

    it('should mark the device authorization as expired when TTL elapsed', async () => {
      vi.mocked(deviceRepository.findOne).mockResolvedValue({
        ...mockDevice,
        expiresAt: new Date(Date.now() - 1000),
      });
      vi.mocked(deviceRepository.save).mockResolvedValue({
        ...mockDevice,
        status: DeviceAuthorizationStatus.EXPIRED,
      });

      const result = await service.findByDeviceCode('device-code-1');

      expect(result?.status).toBe(DeviceAuthorizationStatus.EXPIRED);
      expect(deviceRepository.save).toHaveBeenCalled();
    });

    it('should return null when the device authorization is unknown', async () => {
      vi.mocked(deviceRepository.findOne).mockResolvedValue(null);

      const result = await service.findByDeviceCode('unknown-code');

      expect(result).toBeNull();
    });
  });

  describe('findByUserCode', () => {
    it('should return the device authorization when it is not expired', async () => {
      vi.mocked(deviceRepository.findOne).mockResolvedValue(mockDevice);

      const result = await service.findByUserCode('ABCD-EFGH');

      expect(result).toEqual(mockDevice);
      expect(deviceRepository.save).not.toHaveBeenCalled();
    });

    it('should return null when the user code is unknown', async () => {
      vi.mocked(deviceRepository.findOne).mockResolvedValue(null);

      const result = await service.findByUserCode('ZZZZ-ZZZZ');

      expect(result).toBeNull();
    });

    it('should mark the device authorization as expired when the TTL elapsed', async () => {
      vi.mocked(deviceRepository.findOne).mockResolvedValue({
        ...mockDevice,
        expiresAt: new Date(Date.now() - 1000),
      });
      vi.mocked(deviceRepository.save).mockResolvedValue({
        ...mockDevice,
        status: DeviceAuthorizationStatus.EXPIRED,
      });

      const result = await service.findByUserCode('ABCD-EFGH');

      expect(result?.status).toBe(DeviceAuthorizationStatus.EXPIRED);
      expect(deviceRepository.save).toHaveBeenCalled();
    });
  });

  describe('approve', () => {
    it('should approve a pending device authorization', async () => {
      vi.mocked(deviceRepository.findOne).mockResolvedValue(mockDevice);
      vi.mocked(deviceRepository.save).mockResolvedValue({
        ...mockDevice,
        status: DeviceAuthorizationStatus.APPROVED,
        userId: 'user-1',
      });

      const result = await service.approve('device-code-1', 'user-1');

      expect(result.status).toBe(DeviceAuthorizationStatus.APPROVED);
      expect(result.userId).toBe('user-1');
      expect(deviceRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when the device authorization is unknown', async () => {
      vi.mocked(deviceRepository.findOne).mockResolvedValue(null);

      await expect(service.approve('unknown-code', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when the device authorization is not pending', async () => {
      vi.mocked(deviceRepository.findOne).mockResolvedValue({
        ...mockDevice,
        status: DeviceAuthorizationStatus.APPROVED,
      });

      await expect(service.approve('device-code-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('approveByUserCode', () => {
    it('should approve a pending device via user code', async () => {
      vi.mocked(deviceRepository.findOne).mockResolvedValue({
        ...mockDevice,
        status: DeviceAuthorizationStatus.PENDING,
      });
      vi.mocked(deviceRepository.save).mockResolvedValue({
        ...mockDevice,
        status: DeviceAuthorizationStatus.APPROVED,
        userId: 'user-1',
      });

      const result = await service.approveByUserCode('ABCD-EFGH', 'user-1');

      expect(deviceRepository.findOne).toHaveBeenCalledWith({
        where: { userCode: 'ABCD-EFGH' },
      });
      expect(result.status).toBe(DeviceAuthorizationStatus.APPROVED);
      expect(result.userId).toBe('user-1');
    });

    it('should throw NotFoundException when the user code is unknown', async () => {
      vi.mocked(deviceRepository.findOne).mockResolvedValue(null);

      await expect(
        service.approveByUserCode('ZZZZ-ZZZZ', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when the device is not pending', async () => {
      vi.mocked(deviceRepository.findOne).mockResolvedValue({
        ...mockDevice,
        status: DeviceAuthorizationStatus.APPROVED,
      });

      await expect(
        service.approveByUserCode('ABCD-EFGH', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deny', () => {
    it('should deny a pending device authorization', async () => {
      vi.mocked(deviceRepository.findOne).mockResolvedValue({
        ...mockDevice,
        status: DeviceAuthorizationStatus.PENDING,
      });
      vi.mocked(deviceRepository.save).mockResolvedValue({
        ...mockDevice,
        status: DeviceAuthorizationStatus.DENIED,
      });

      const result = await service.deny('device-code-1');

      expect(result.status).toBe(DeviceAuthorizationStatus.DENIED);
      expect(deviceRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when the device authorization is unknown', async () => {
      vi.mocked(deviceRepository.findOne).mockResolvedValue(null);

      await expect(service.deny('unknown-code')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when the device authorization is not pending', async () => {
      vi.mocked(deviceRepository.findOne).mockResolvedValue({
        ...mockDevice,
        status: DeviceAuthorizationStatus.APPROVED,
      });

      await expect(service.deny('device-code-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('isExpired', () => {
    it('should return true when the device authorization TTL elapsed', () => {
      expect(
        service.isExpired({
          ...mockDevice,
          expiresAt: new Date(Date.now() - 1000),
        }),
      ).toBe(true);
    });

    it('should return false when the device authorization is still valid', () => {
      expect(service.isExpired(mockDevice)).toBe(false);
    });
  });

  describe('cleanupExpired', () => {
    it('should delete expired device authorizations', async () => {
      vi.mocked(deviceRepository.delete).mockResolvedValue(undefined as any);

      await service.cleanupExpired();

      expect(deviceRepository.delete).toHaveBeenCalled();
    });
  });
});
