import bcrypt
import psycopg2.extras


class AuthService:
    """用户认证与账户管理服务"""

    def __init__(self, db_conn):
        self._db_conn = db_conn

    def _execute(self, query, params=None):
        """执行 SQL 查询/命令"""
        cursor = self._db_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        try:
            if params:
                cursor.execute(query, params)
            else:
                cursor.execute(query)

            if query.strip().upper().startswith('SELECT'):
                return cursor.fetchall()
            elif query.strip().upper().startswith('INSERT'):
                rows = cursor.fetchall() if cursor.description else []
                self._db_conn.commit()
                return rows
            else:
                self._db_conn.commit()
                return cursor.rowcount
        except Exception as e:
            self._db_conn.rollback()
            raise e
        finally:
            cursor.close()

    @staticmethod
    def hash_password(password: str) -> str:
        """使用 bcrypt 对密码进行哈希"""
        return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt(rounds=12)).decode('utf-8')

    @staticmethod
    def check_password(password: str, hashed: str) -> bool:
        """验证密码与哈希是否匹配"""
        return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

    def authenticate_user(self, username: str, password: str):
        """
        验证用户凭据。
        若密码是明文（旧数据）且验证通过，自动升级为 bcrypt 哈希。
        成功返回用户 dict，失败返回 None。
        """
        query = """
            SELECT user_id, username, password, role, preferences
            FROM users
            WHERE username = %s
        """
        result = self._execute(query, (username,))
        if not result or len(result) == 0:
            return None

        user = dict(result[0])
        stored_pw = user['password'] or ''
        is_valid = False

        if stored_pw.startswith('$2'):
            is_valid = self.check_password(password, stored_pw)
        else:
            # 明文密码兼容（旧数据）
            is_valid = (password == stored_pw)
            if is_valid:
                new_hash = self.hash_password(password)
                self._execute(
                    "UPDATE users SET password = %s WHERE user_id = %s",
                    (new_hash, user['user_id'])
                )

        if not is_valid:
            return None
        return user

    def update_last_login(self, user_id: int):
        """更新用户最后登录时间"""
        self._execute(
            "UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE user_id = %s",
            (user_id,)
        )

    def register_user(self, username: str, password: str, role: str = 'researcher') -> int:
        """
        注册新用户。
        若用户名已存在抛出 ValueError。
        返回新用户 user_id。
        """
        exists = self._execute("SELECT 1 FROM users WHERE username = %s", (username,))
        if exists:
            raise ValueError("用户名已存在")

        password_hash = self.hash_password(password)
        query = """
            INSERT INTO users (username, password, role)
            VALUES (%s, %s, %s)
            RETURNING user_id
        """
        result = self._execute(query, (username, password_hash, role))
        return result[0]['user_id'] if result else None

    def get_user_by_id(self, user_id: int):
        """获取用户详细信息"""
        query = """
            SELECT user_id, username, role, last_login_at, created_at, preferences
            FROM users
            WHERE user_id = %s
        """
        result = self._execute(query, (user_id,))
        return dict(result[0]) if result else None

    def get_user_role(self, user_id: int) -> str:
        """获取用户角色"""
        result = self._execute(
            "SELECT role FROM users WHERE user_id = %s", (user_id,)
        )
        if result:
            return result[0].get('role')
        return None

    def get_user_count(self) -> int:
        """获取用户总数"""
        result = self._execute("SELECT COUNT(*) as count FROM users")
        return result[0]['count'] if result else 0

    def list_users(self):
        """获取所有用户列表（管理员用）"""
        query = """
            SELECT user_id, username, role, created_at, last_login_at
            FROM users
            ORDER BY user_id
        """
        return [dict(row) for row in self._execute(query)]

    def delete_user(self, user_id: int):
        """删除用户"""
        self._execute("DELETE FROM users WHERE user_id = %s", (user_id,))

    def get_user_contributions(self, user_id: int):
        """获取用户贡献统计"""
        query = """
            SELECT
                u.user_id,
                u.username,
                u.role,
                u.created_at,
                COALESCE(dv.count, 0) AS dataset_contributions,
                COALESCE(mc.count, 0) AS model_contributions,
                COALESCE(tc.count, 0) AS training_count
            FROM users u
            LEFT JOIN (
                SELECT created_by, COUNT(*) AS count
                FROM dataset_versions
                GROUP BY created_by
            ) dv ON dv.created_by = u.user_id
            LEFT JOIN (
                SELECT author, COUNT(*) AS count
                FROM model_commits
                GROUP BY author
            ) mc ON mc.author = u.user_id
            LEFT JOIN (
                SELECT created_by, COUNT(*) AS count
                FROM trainings
                GROUP BY created_by
            ) tc ON tc.created_by = u.user_id
            WHERE u.user_id = %s
        """
        result = self._execute(query, (user_id,))
        if not result:
            return None
        user = dict(result[0])
        total = (
            user['dataset_contributions']
            + user['model_contributions']
            + user['training_count']
        )
        user['total_contributions'] = total
        return user
