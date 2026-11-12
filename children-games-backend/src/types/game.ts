import { GameProgress } from '../models/GameProgress';
import { User } from '../models/User';

export interface GameProgressWithUser extends GameProgress {
  user?: Pick<User, 'id' | 'nickname' | 'avatar'>;
}
