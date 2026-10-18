package `in`.patternsports.ams

import android.app.Application
import `in`.patternsports.ams.data.PsamsRepository

class PsamsApplication : Application() {
    lateinit var repository: PsamsRepository
        private set

    override fun onCreate() {
        super.onCreate()
        repository = PsamsRepository(applicationContext)
    }
}
