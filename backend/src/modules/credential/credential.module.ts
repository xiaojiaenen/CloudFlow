import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CredentialController } from './credential.controller';
import { CredentialService } from './credential.service';

@Module({
  imports: [AuthModule],
  controllers: [CredentialController],
  providers: [CredentialService],
  exports: [CredentialService],
})
export class CredentialModule {}
