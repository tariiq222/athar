import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { AuthController } from './auth/auth.controller';
import { AccountProfileController } from './accounts/account-profile.controller';
import { UserController } from './user/user.controller';

describe('AppModule', () => {
  it('compiles with auth, accounts and user controllers wired', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    expect(moduleRef.get(AuthController)).toBeDefined();
    expect(moduleRef.get(AccountProfileController)).toBeDefined();
    expect(moduleRef.get(UserController)).toBeDefined();
  });
});