import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';
import { requestContext } from '../audit';
import type { AuthPrincipal } from '../common/auth/auth.types';
import { CLOCK, type Clock } from '../common/clock';
import { AuthenticatedOnly } from '../common/decorators/authenticated-only.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import {
  CACHE_CONTROL_NO_STORE,
  HTTP_HEADERS,
} from '../common/http/http-headers.constants';
import { AuthThrottle } from '../common/throttle/auth-throttle.decorator';
import { createApiErrors } from '../common/swagger/api-errors.decorator';
import { AppConfigService } from '../config/app-config.service';
import { AuthService } from './auth.service';
import type { AuthSession } from './auth.types';
import { AuthUserDto, LoginResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { CSRF_HEADER_VALUE } from './auth.constants';
import { CsrfGuard } from './guards/csrf.guard';

const ApiErrors = createApiErrors({
  [HttpStatus.UNAUTHORIZED]:
    'Invalid credentials, or a missing, invalid, expired or revoked token',
  [HttpStatus.FORBIDDEN]:
    'CSRF checks failed (custom header, Origin or Sec-Fetch-Site)',
});

const ApiCsrfHeader = () =>
  ApiHeader({
    name: HTTP_HEADERS.REQUESTED_WITH,
    required: true,
    enum: [CSRF_HEADER_VALUE],
    description: 'CSRF defense: a custom header forces a CORS preflight.',
  });

const SET_COOKIE_HEADER = {
  [HTTP_HEADERS.SET_COOKIE]: {
    description:
      'Rotated refresh token: HttpOnly; Secure; SameSite=Strict; narrow Path.',
    schema: { type: 'string' },
  },
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfigService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Public()
  @AuthThrottle('login')
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Header(HTTP_HEADERS.CACHE_CONTROL, CACHE_CONTROL_NO_STORE)
  @ApiOperation({
    summary: 'Log in with email and password',
    description:
      'Returns an access token and sets the refresh cookie. Unknown email, wrong password ' +
      'and locked account all return the same 401. Throttled per IP.',
  })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: LoginResponseDto, headers: SET_COOKIE_HEADER })
  @ApiErrors(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.TOO_MANY_REQUESTS,
  )
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const session = await this.auth.login(
      dto.email,
      dto.password,
      requestContext(req),
    );
    return this.respondWithSession(res, session);
  }

  @Public()
  @AuthThrottle('refresh')
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @Header(HTTP_HEADERS.CACHE_CONTROL, CACHE_CONTROL_NO_STORE)
  @ApiOperation({
    summary: 'Rotate the refresh cookie and get a new access token',
    description:
      'Reads the refresh cookie. Presenting an already rotated token revokes the whole ' +
      'session. Throttled per IP.',
  })
  @ApiCsrfHeader()
  @ApiOkResponse({ type: LoginResponseDto, headers: SET_COOKIE_HEADER })
  @ApiErrors(
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.TOO_MANY_REQUESTS,
  )
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    try {
      const session = await this.auth.refresh(
        this.readCookie(req),
        requestContext(req),
      );
      return this.respondWithSession(res, session);
    } catch (error) {
      // A dead cookie is useless to the browser; dropping it stops retry loops.
      if (error instanceof UnauthorizedException) this.clearCookie(res);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiOperation({
    summary: 'Revoke the current session and clear the refresh cookie',
    description:
      'Idempotent. Access tokens of the session stop working immediately.',
  })
  @ApiCsrfHeader()
  @ApiNoContentResponse({ description: 'Session revoked (or there was none).' })
  @ApiErrors(HttpStatus.FORBIDDEN, HttpStatus.TOO_MANY_REQUESTS)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(this.readCookie(req), requestContext(req));
    this.clearCookie(res);
  }

  @Get('me')
  @AuthenticatedOnly()
  @Header(HTTP_HEADERS.CACHE_CONTROL, CACHE_CONTROL_NO_STORE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The signed-in user' })
  @ApiOkResponse({ type: AuthUserDto })
  @ApiErrors(HttpStatus.UNAUTHORIZED, HttpStatus.TOO_MANY_REQUESTS)
  me(@CurrentUser() principal: AuthPrincipal): Promise<AuthUserDto> {
    return this.auth.getProfile(principal);
  }

  private readCookie(req: Request): unknown {
    const cookies = req.cookies as Record<string, unknown> | undefined;
    return cookies?.[this.config.get('refreshCookieName')];
  }

  private respondWithSession(
    res: Response,
    session: AuthSession,
  ): LoginResponseDto {
    const maxAge =
      session.refreshExpiresAt.getTime() - this.clock.now().getTime();
    res.cookie(this.config.get('refreshCookieName'), session.refreshToken, {
      ...this.cookieOptions(),
      maxAge,
    });
    return session.body;
  }

  private clearCookie(res: Response): void {
    res.clearCookie(this.config.get('refreshCookieName'), this.cookieOptions());
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get('cookieSecure'),
      sameSite: 'strict',
      path: this.config.get('refreshCookiePath'),
    };
  }
}
